import * as React from 'react';
import { useEffect } from 'react';
import { render, act } from '@testing-library/react';
import {
    OIMEventQueue,
    OIMEventQueueSchedulerImmediate,
    OIMReactiveCollection,
    OIMReactiveIndexManualSetBased,
    OIMReactiveIndexManualArrayBased,
} from '@oimdb/core';
import {
    useSelectEntityByPk,
    useSelectEntitiesByPks,
    useSelectEntitiesByIndexKeySetBased,
    useSelectEntitiesByIndexKeyArrayBased,
    useSelectPksByIndexKeySetBased,
    useSelectPksByIndexKeyArrayBased,
    useSelectPksByIndexKeysSetBased,
    useSelectPksByIndexKeysArrayBased,
    useSelectEntitiesByIndexKeysSetBased,
    useSelectEntitiesByIndexKeysArrayBased,
} from '../src/hooks';

interface User {
    id: string;
    name: string;
    age: number;
    email: string;
}

// Helper component to track renders
function RenderTracker({
    onRender,
    children,
}: {
    onRender: () => void;
    children?: React.ReactNode;
}) {
    useEffect(() => {
        onRender();
    });
    return <>{children}</>;
}

describe('Render Optimization Tests', () => {
    let queue: OIMEventQueue;
    let collection: OIMReactiveCollection<User, string>;

    beforeEach(() => {
        const scheduler = new OIMEventQueueSchedulerImmediate();
        queue = new OIMEventQueue({ scheduler });
        collection = new OIMReactiveCollection<User, string>(queue);
    });

    afterEach(() => {
        queue.destroy();
    });

    describe('useSelectEntityByPk - minimum re-renders', () => {
        test('should only re-render component when its specific entity changes', () => {
            // Setup initial data
            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
                {
                    id: '3',
                    name: 'Charlie',
                    age: 35,
                    email: 'charlie@test.com',
                },
            ]);
            queue.flush();

            let user1RenderCount = 0;
            let user2RenderCount = 0;
            let user3RenderCount = 0;

            const User1Component = () => {
                const user = useSelectEntityByPk(collection, '1');
                return (
                    <RenderTracker
                        onRender={() => {
                            user1RenderCount++;
                        }}
                    >
                        <div data-testid="user1">{user?.name}</div>
                    </RenderTracker>
                );
            };

            const User2Component = () => {
                const user = useSelectEntityByPk(collection, '2');
                return (
                    <RenderTracker
                        onRender={() => {
                            user2RenderCount++;
                        }}
                    >
                        <div data-testid="user2">{user?.name}</div>
                    </RenderTracker>
                );
            };

            const User3Component = () => {
                const user = useSelectEntityByPk(collection, '3');
                return (
                    <RenderTracker
                        onRender={() => {
                            user3RenderCount++;
                        }}
                    >
                        <div data-testid="user3">{user?.name}</div>
                    </RenderTracker>
                );
            };

            const { getByTestId } = render(
                <div>
                    <User1Component />
                    <User2Component />
                    <User3Component />
                </div>
            );

            // Initial renders
            expect(user1RenderCount).toBeGreaterThan(0);
            expect(user2RenderCount).toBeGreaterThan(0);
            expect(user3RenderCount).toBeGreaterThan(0);

            // Verify initial values are rendered correctly
            expect(getByTestId('user1').textContent).toBe('Alice');
            expect(getByTestId('user2').textContent).toBe('Bob');
            expect(getByTestId('user3').textContent).toBe('Charlie');

            const initialUser1Count = user1RenderCount;
            const initialUser2Count = user2RenderCount;
            const initialUser3Count = user3RenderCount;

            // Update only user1
            act(() => {
                collection.upsertOne({
                    id: '1',
                    name: 'Alice Updated',
                    age: 31,
                    email: 'alice@test.com',
                });
                queue.flush();
            });

            // Only user1 should re-render
            expect(user1RenderCount).toBeGreaterThan(initialUser1Count);
            expect(user2RenderCount).toBe(initialUser2Count);
            expect(user3RenderCount).toBe(initialUser3Count);

            // Verify updated values are rendered correctly
            expect(getByTestId('user1').textContent).toBe('Alice Updated');
            expect(getByTestId('user2').textContent).toBe('Bob');
            expect(getByTestId('user3').textContent).toBe('Charlie');
        });

        test('should not re-render when unrelated entity is updated', () => {
            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
            ]);
            queue.flush();

            let user1RenderCount = 0;

            const User1Component = () => {
                const user = useSelectEntityByPk(collection, '1');
                return (
                    <RenderTracker
                        onRender={() => {
                            user1RenderCount++;
                        }}
                    >
                        <div data-testid="user1">{user?.name}</div>
                    </RenderTracker>
                );
            };

            const { getByTestId } = render(<User1Component />);

            // Verify initial value is rendered correctly
            expect(getByTestId('user1').textContent).toBe('Alice');

            const initialCount = user1RenderCount;

            // Update user2 (unrelated)
            act(() => {
                collection.upsertOne({
                    id: '2',
                    name: 'Bob Updated',
                    age: 26,
                    email: 'bob@test.com',
                });
                queue.flush();
            });

            // user1 should NOT re-render
            expect(user1RenderCount).toBe(initialCount);
            // Verify value remains unchanged
            expect(getByTestId('user1').textContent).toBe('Alice');
        });

        test('should handle multiple rapid updates to same entity with minimal re-renders', () => {
            collection.upsertOne({
                id: '1',
                name: 'Alice',
                age: 30,
                email: 'alice@test.com',
            });
            queue.flush();

            let renderCount = 0;

            const UserComponent = () => {
                const user = useSelectEntityByPk(collection, '1');
                return (
                    <RenderTracker
                        onRender={() => {
                            renderCount++;
                        }}
                    >
                        <div data-testid="user">{user?.name}</div>
                    </RenderTracker>
                );
            };

            const { getByTestId } = render(<UserComponent />);

            // Verify initial value is rendered correctly
            expect(getByTestId('user').textContent).toBe('Alice');

            const initialCount = renderCount;

            // Multiple rapid updates
            act(() => {
                collection.upsertOne({
                    id: '1',
                    name: 'Alice 2',
                    age: 30,
                    email: 'alice@test.com',
                });
                collection.upsertOne({
                    id: '1',
                    name: 'Alice 3',
                    age: 30,
                    email: 'alice@test.com',
                });
                collection.upsertOne({
                    id: '1',
                    name: 'Alice Final',
                    age: 30,
                    email: 'alice@test.com',
                });
                queue.flush();
            });

            // Should have minimal re-renders (coalesced)
            expect(renderCount).toBeGreaterThan(initialCount);
            // But should not be excessive (coalescing should help)
            expect(renderCount - initialCount).toBeLessThanOrEqual(3);
            // Verify final updated value is rendered correctly
            expect(getByTestId('user').textContent).toBe('Alice Final');
        });
    });

    describe('useSelectEntitiesByPks - minimum re-renders', () => {
        test('should only re-render when subscribed entities change', () => {
            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
                {
                    id: '3',
                    name: 'Charlie',
                    age: 35,
                    email: 'charlie@test.com',
                },
            ]);
            queue.flush();

            let component1RenderCount = 0;
            let component2RenderCount = 0;
            const pks = ['1', '2'];
            const pks2 = ['3'];

            const Component1 = () => {
                const users = useSelectEntitiesByPks(collection, pks);
                return (
                    <RenderTracker
                        onRender={() => {
                            component1RenderCount++;
                        }}
                    >
                        <div data-testid="comp1">
                            {users?.map(u => u?.name).join(', ') || ''}
                        </div>
                    </RenderTracker>
                );
            };

            const Component2 = () => {
                const users = useSelectEntitiesByPks(collection, pks2);
                return (
                    <RenderTracker
                        onRender={() => {
                            component2RenderCount++;
                        }}
                    >
                        <div data-testid="comp2">
                            {users?.map(u => u?.name).join(', ') || ''}
                        </div>
                    </RenderTracker>
                );
            };

            const { getByTestId } = render(
                <div>
                    <Component1 />
                    <Component2 />
                </div>
            );

            // Verify initial values are rendered correctly
            expect(getByTestId('comp1').textContent).toBe('Alice, Bob');
            expect(getByTestId('comp2').textContent).toBe('Charlie');

            const initialComp1Count = component1RenderCount;
            const initialComp2Count = component2RenderCount;

            // Update entity '1' (subscribed by Component1)
            act(() => {
                collection.upsertOne({
                    id: '1',
                    name: 'Alice Updated',
                    age: 31,
                    email: 'alice@test.com',
                });
                queue.flush();
            });

            // Only Component1 should re-render
            expect(component1RenderCount).toBeGreaterThan(initialComp1Count);
            expect(component2RenderCount).toBe(initialComp2Count);
            // Verify updated values are rendered correctly
            expect(getByTestId('comp1').textContent).toBe('Alice Updated, Bob');
            expect(getByTestId('comp2').textContent).toBe('Charlie');

            // Update entity '3' (subscribed by Component2)
            act(() => {
                collection.upsertOne({
                    id: '3',
                    name: 'Charlie Updated',
                    age: 36,
                    email: 'charlie@test.com',
                });
                queue.flush();
            });

            // Only Component2 should re-render
            expect(component2RenderCount).toBeGreaterThan(initialComp2Count);
            // Verify updated values are rendered correctly
            expect(getByTestId('comp1').textContent).toBe('Alice Updated, Bob');
            expect(getByTestId('comp2').textContent).toBe('Charlie Updated');
        });

        test('should not re-render when unrelated entities change', () => {
            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
                {
                    id: '3',
                    name: 'Charlie',
                    age: 35,
                    email: 'charlie@test.com',
                },
            ]);
            queue.flush();

            let renderCount = 0;

            const Component = () => {
                const users = useSelectEntitiesByPks(collection, ['1', '2']);
                return (
                    <RenderTracker
                        onRender={() => {
                            renderCount++;
                        }}
                    >
                        <div data-testid="comp">
                            {users?.map(u => u?.name).join(', ') || ''}
                        </div>
                    </RenderTracker>
                );
            };

            const { getByTestId } = render(<Component />);

            // Verify initial values are rendered correctly
            expect(getByTestId('comp').textContent).toBe('Alice, Bob');

            const initialCount = renderCount;

            // Update entity '3' (not subscribed)
            act(() => {
                collection.upsertOne({
                    id: '3',
                    name: 'Charlie Updated',
                    age: 36,
                    email: 'charlie@test.com',
                });
                queue.flush();
            });

            // Should NOT re-render
            expect(renderCount).toBe(initialCount);
            // Verify values remain unchanged
            expect(getByTestId('comp').textContent).toBe('Alice, Bob');
        });
    });

    describe('useSelectEntitiesByIndexKeySetBased - minimum re-renders', () => {
        test('should only re-render when index key changes', () => {
            const index = new OIMReactiveIndexManualSetBased<string, string>(
                queue
            );

            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
                {
                    id: '3',
                    name: 'Charlie',
                    age: 35,
                    email: 'charlie@test.com',
                },
            ]);
            index.setPks('team1', ['1', '2']);
            index.setPks('team2', ['3']);
            queue.flush();

            let team1RenderCount = 0;
            let team2RenderCount = 0;

            const Team1Component = () => {
                const users = useSelectEntitiesByIndexKeySetBased(
                    collection,
                    index,
                    'team1'
                );
                return (
                    <RenderTracker
                        onRender={() => {
                            team1RenderCount++;
                        }}
                    >
                        <div data-testid="team1">
                            {users?.map(u => u?.name).join(', ') || ''}
                        </div>
                    </RenderTracker>
                );
            };

            const Team2Component = () => {
                const users = useSelectEntitiesByIndexKeySetBased(
                    collection,
                    index,
                    'team2'
                );
                return (
                    <RenderTracker
                        onRender={() => {
                            team2RenderCount++;
                        }}
                    >
                        <div data-testid="team2">
                            {users?.map(u => u?.name).join(', ') || ''}
                        </div>
                    </RenderTracker>
                );
            };

            const { getByTestId } = render(
                <div>
                    <Team1Component />
                    <Team2Component />
                </div>
            );

            // Verify initial values are rendered correctly
            expect(getByTestId('team1').textContent).toBe('Alice, Bob');
            expect(getByTestId('team2').textContent).toBe('Charlie');

            const initialTeam1Count = team1RenderCount;
            const initialTeam2Count = team2RenderCount;

            // Update index for team1
            act(() => {
                index.setPks('team1', ['1', '2', '3']);
                queue.flush();
            });

            // Only Team1Component should re-render
            expect(team1RenderCount).toBeGreaterThan(initialTeam1Count);
            expect(team2RenderCount).toBe(initialTeam2Count);
            // Verify updated values are rendered correctly
            expect(getByTestId('team1').textContent).toBe(
                'Alice, Bob, Charlie'
            );
            expect(getByTestId('team2').textContent).toBe('Charlie');

            // Update index for team2
            act(() => {
                index.setPks('team2', ['3', '1']);
                queue.flush();
            });

            // Only Team2Component should re-render
            expect(team2RenderCount).toBeGreaterThan(initialTeam2Count);
            // Verify updated values are rendered correctly
            expect(getByTestId('team1').textContent).toBe(
                'Alice, Bob, Charlie'
            );
            expect(getByTestId('team2').textContent).toBe('Charlie, Alice');
        });

        test('should re-render when entity in index changes', () => {
            const index = new OIMReactiveIndexManualSetBased<string, string>(
                queue
            );

            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
            ]);
            index.setPks('team1', ['1', '2']);
            queue.flush();

            let renderCount = 0;

            const TeamComponent = () => {
                const users = useSelectEntitiesByIndexKeySetBased(
                    collection,
                    index,
                    'team1'
                );
                return (
                    <RenderTracker
                        onRender={() => {
                            renderCount++;
                        }}
                    >
                        <div data-testid="team">
                            {users?.map(u => u?.name).join(', ') || ''}
                        </div>
                    </RenderTracker>
                );
            };

            const { getByTestId } = render(<TeamComponent />);

            // Verify initial values are rendered correctly
            expect(getByTestId('team').textContent).toBe('Alice, Bob');

            const initialCount = renderCount;

            // Update entity '1' (in team1 index)
            act(() => {
                collection.upsertOne({
                    id: '1',
                    name: 'Alice Updated',
                    age: 31,
                    email: 'alice@test.com',
                });
                queue.flush();
            });

            // Should re-render because entity in index changed
            expect(renderCount).toBeGreaterThan(initialCount);
            // Verify updated values are rendered correctly
            expect(getByTestId('team').textContent).toBe('Alice Updated, Bob');
        });

        test('should not re-render when unrelated index key changes', () => {
            const index = new OIMReactiveIndexManualSetBased<string, string>(
                queue
            );

            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
            ]);
            index.setPks('team1', ['1']);
            index.setPks('team2', ['2']);
            queue.flush();

            let renderCount = 0;

            const Team1Component = () => {
                const users = useSelectEntitiesByIndexKeySetBased(
                    collection,
                    index,
                    'team1'
                );
                return (
                    <RenderTracker
                        onRender={() => {
                            renderCount++;
                        }}
                    >
                        <div data-testid="team1">
                            {users?.map(u => u?.name).join(', ') || ''}
                        </div>
                    </RenderTracker>
                );
            };

            const { getByTestId } = render(<Team1Component />);

            // Verify initial values are rendered correctly
            expect(getByTestId('team1').textContent).toBe('Alice');

            const initialCount = renderCount;

            // Update index for team2 (unrelated)
            act(() => {
                index.setPks('team2', ['2', '1']);
                queue.flush();
            });

            // Should NOT re-render
            expect(renderCount).toBe(initialCount);
            // Verify values remain unchanged
            expect(getByTestId('team1').textContent).toBe('Alice');
        });
    });

    describe('useSelectEntitiesByIndexKeyArrayBased - minimum re-renders', () => {
        test('should only re-render when index key changes', () => {
            const index = new OIMReactiveIndexManualArrayBased<string, string>(
                queue
            );

            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
                {
                    id: '3',
                    name: 'Charlie',
                    age: 35,
                    email: 'charlie@test.com',
                },
            ]);
            index.setPks('team1', ['1', '2']);
            index.setPks('team2', ['3']);
            queue.flush();

            let team1RenderCount = 0;
            let team2RenderCount = 0;

            const Team1Component = () => {
                const users = useSelectEntitiesByIndexKeyArrayBased(
                    collection,
                    index,
                    'team1'
                );
                return (
                    <RenderTracker
                        onRender={() => {
                            team1RenderCount++;
                        }}
                    >
                        <div data-testid="team1">
                            {users?.map(u => u?.name).join(', ') || ''}
                        </div>
                    </RenderTracker>
                );
            };

            const Team2Component = () => {
                const users = useSelectEntitiesByIndexKeyArrayBased(
                    collection,
                    index,
                    'team2'
                );
                return (
                    <RenderTracker
                        onRender={() => {
                            team2RenderCount++;
                        }}
                    >
                        <div data-testid="team2">
                            {users?.map(u => u?.name).join(', ') || ''}
                        </div>
                    </RenderTracker>
                );
            };

            const { getByTestId } = render(
                <div>
                    <Team1Component />
                    <Team2Component />
                </div>
            );

            // Verify initial values are rendered correctly
            expect(getByTestId('team1').textContent).toBe('Alice, Bob');
            expect(getByTestId('team2').textContent).toBe('Charlie');

            const initialTeam1Count = team1RenderCount;
            const initialTeam2Count = team2RenderCount;

            // Update index for team1
            act(() => {
                index.setPks('team1', ['1', '2', '3']);
                queue.flush();
            });

            // Only Team1Component should re-render
            expect(team1RenderCount).toBeGreaterThan(initialTeam1Count);
            expect(team2RenderCount).toBe(initialTeam2Count);
            // Verify updated values are rendered correctly
            expect(getByTestId('team1').textContent).toBe(
                'Alice, Bob, Charlie'
            );
            expect(getByTestId('team2').textContent).toBe('Charlie');
        });
    });

    describe('Complex scenarios - multiple components', () => {
        test('should minimize re-renders in complex scenario with multiple entities and indexes', () => {
            const index = new OIMReactiveIndexManualSetBased<string, string>(
                queue
            );

            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
                {
                    id: '3',
                    name: 'Charlie',
                    age: 35,
                    email: 'charlie@test.com',
                },
                { id: '4', name: 'David', age: 28, email: 'david@test.com' },
            ]);
            index.setPks('team1', ['1', '2']);
            index.setPks('team2', ['3', '4']);
            queue.flush();

            let user1RenderCount = 0;
            let user2RenderCount = 0;
            let team1RenderCount = 0;
            let team2RenderCount = 0;

            const User1Component = () => {
                const user = useSelectEntityByPk(collection, '1');
                return (
                    <RenderTracker
                        onRender={() => {
                            user1RenderCount++;
                        }}
                    >
                        <div data-testid="user1">{user?.name}</div>
                    </RenderTracker>
                );
            };

            const User2Component = () => {
                const user = useSelectEntityByPk(collection, '2');
                return (
                    <RenderTracker
                        onRender={() => {
                            user2RenderCount++;
                        }}
                    >
                        <div data-testid="user2">{user?.name}</div>
                    </RenderTracker>
                );
            };

            const Team1Component = () => {
                const users = useSelectEntitiesByIndexKeySetBased(
                    collection,
                    index,
                    'team1'
                );
                return (
                    <RenderTracker
                        onRender={() => {
                            team1RenderCount++;
                        }}
                    >
                        <div data-testid="team1">
                            {users?.map(u => u?.name).join(', ') || ''}
                        </div>
                    </RenderTracker>
                );
            };

            const Team2Component = () => {
                const users = useSelectEntitiesByIndexKeySetBased(
                    collection,
                    index,
                    'team2'
                );
                return (
                    <RenderTracker
                        onRender={() => {
                            team2RenderCount++;
                        }}
                    >
                        <div data-testid="team2">
                            {users?.map(u => u?.name).join(', ') || ''}
                        </div>
                    </RenderTracker>
                );
            };

            const { getByTestId } = render(
                <div>
                    <User1Component />
                    <User2Component />
                    <Team1Component />
                    <Team2Component />
                </div>
            );

            // Verify initial values are rendered correctly
            expect(getByTestId('user1').textContent).toBe('Alice');
            expect(getByTestId('user2').textContent).toBe('Bob');
            expect(getByTestId('team1').textContent).toBe('Alice, Bob');
            expect(getByTestId('team2').textContent).toBe('Charlie, David');

            const initialUser1Count = user1RenderCount;
            const initialUser2Count = user2RenderCount;
            const initialTeam1Count = team1RenderCount;
            const initialTeam2Count = team2RenderCount;

            // Update entity '3' (in team2, not directly subscribed by any user component)
            act(() => {
                collection.upsertOne({
                    id: '3',
                    name: 'Charlie Updated',
                    age: 36,
                    email: 'charlie@test.com',
                });
                queue.flush();
            });

            // Only Team2Component should re-render (because it shows entity '3')
            expect(user1RenderCount).toBe(initialUser1Count);
            expect(user2RenderCount).toBe(initialUser2Count);
            expect(team1RenderCount).toBe(initialTeam1Count);
            expect(team2RenderCount).toBeGreaterThan(initialTeam2Count);
            // Verify updated values are rendered correctly
            expect(getByTestId('user1').textContent).toBe('Alice');
            expect(getByTestId('user2').textContent).toBe('Bob');
            expect(getByTestId('team1').textContent).toBe('Alice, Bob');
            expect(getByTestId('team2').textContent).toBe(
                'Charlie Updated, David'
            );

            // Update entity '1' (in team1, subscribed by User1Component)
            act(() => {
                collection.upsertOne({
                    id: '1',
                    name: 'Alice Updated',
                    age: 31,
                    email: 'alice@test.com',
                });
                queue.flush();
            });

            // Both User1Component and Team1Component should re-render
            expect(user1RenderCount).toBeGreaterThan(initialUser1Count);
            expect(user2RenderCount).toBe(initialUser2Count);
            expect(team1RenderCount).toBeGreaterThan(initialTeam1Count);
            expect(team2RenderCount).toBeGreaterThan(initialTeam2Count); // Already updated
            // Verify updated values are rendered correctly
            expect(getByTestId('user1').textContent).toBe('Alice Updated');
            expect(getByTestId('user2').textContent).toBe('Bob');
            expect(getByTestId('team1').textContent).toBe('Alice Updated, Bob');
            expect(getByTestId('team2').textContent).toBe(
                'Charlie Updated, David'
            );
        });

        test('should handle index changes without affecting unrelated components', () => {
            const index = new OIMReactiveIndexManualSetBased<string, string>(
                queue
            );

            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
                {
                    id: '3',
                    name: 'Charlie',
                    age: 35,
                    email: 'charlie@test.com',
                },
            ]);
            index.setPks('team1', ['1', '2']);
            index.setPks('team2', ['3']);
            queue.flush();

            let user1RenderCount = 0;
            let team1RenderCount = 0;
            let team2RenderCount = 0;

            const User1Component = () => {
                const user = useSelectEntityByPk(collection, '1');
                return (
                    <RenderTracker
                        onRender={() => {
                            user1RenderCount++;
                        }}
                    >
                        <div data-testid="user1">{user?.name}</div>
                    </RenderTracker>
                );
            };

            const Team1Component = () => {
                const users = useSelectEntitiesByIndexKeySetBased(
                    collection,
                    index,
                    'team1'
                );
                return (
                    <RenderTracker
                        onRender={() => {
                            team1RenderCount++;
                        }}
                    >
                        <div data-testid="team1">
                            {users?.map(u => u?.name).join(', ') || ''}
                        </div>
                    </RenderTracker>
                );
            };

            const Team2Component = () => {
                const users = useSelectEntitiesByIndexKeySetBased(
                    collection,
                    index,
                    'team2'
                );
                return (
                    <RenderTracker
                        onRender={() => {
                            team2RenderCount++;
                        }}
                    >
                        <div data-testid="team2">
                            {users?.map(u => u?.name).join(', ') || ''}
                        </div>
                    </RenderTracker>
                );
            };

            const { getByTestId } = render(
                <div>
                    <User1Component />
                    <Team1Component />
                    <Team2Component />
                </div>
            );

            // Verify initial values are rendered correctly
            expect(getByTestId('user1').textContent).toBe('Alice');
            expect(getByTestId('team1').textContent).toBe('Alice, Bob');
            expect(getByTestId('team2').textContent).toBe('Charlie');

            const initialUser1Count = user1RenderCount;
            const initialTeam1Count = team1RenderCount;
            const initialTeam2Count = team2RenderCount;

            // Update index for team2 (unrelated to user1 and team1)
            act(() => {
                index.setPks('team2', ['3', '1']);
                queue.flush();
            });

            // Only Team2Component should re-render
            expect(user1RenderCount).toBe(initialUser1Count);
            expect(team1RenderCount).toBe(initialTeam1Count);
            expect(team2RenderCount).toBeGreaterThan(initialTeam2Count);
            // Verify updated values are rendered correctly
            expect(getByTestId('user1').textContent).toBe('Alice');
            expect(getByTestId('team1').textContent).toBe('Alice, Bob');
            expect(getByTestId('team2').textContent).toBe('Charlie, Alice');
        });
    });

    describe('useSelectPksByIndexKey - minimum re-renders', () => {
        test('should only re-render when index key changes (SetBased)', () => {
            const index = new OIMReactiveIndexManualSetBased<string, string>(
                queue
            );

            index.setPks('team1', ['1', '2']);
            index.setPks('team2', ['3']);
            queue.flush();

            let team1RenderCount = 0;
            let team2RenderCount = 0;

            const Team1Component = () => {
                const pks = useSelectPksByIndexKeySetBased(index, 'team1');
                return (
                    <RenderTracker
                        onRender={() => {
                            team1RenderCount++;
                        }}
                    >
                        <div data-testid="team1">
                            {pks ? Array.from(pks).join(', ') : ''}
                        </div>
                    </RenderTracker>
                );
            };

            const Team2Component = () => {
                const pks = useSelectPksByIndexKeySetBased(index, 'team2');
                return (
                    <RenderTracker
                        onRender={() => {
                            team2RenderCount++;
                        }}
                    >
                        <div data-testid="team2">
                            {pks ? Array.from(pks).join(', ') : ''}
                        </div>
                    </RenderTracker>
                );
            };

            const { getByTestId } = render(
                <div>
                    <Team1Component />
                    <Team2Component />
                </div>
            );

            // Verify initial values are rendered correctly
            expect(getByTestId('team1').textContent).toBe('1, 2');
            expect(getByTestId('team2').textContent).toBe('3');

            const initialTeam1Count = team1RenderCount;
            const initialTeam2Count = team2RenderCount;

            // Update index for team1
            act(() => {
                index.setPks('team1', ['1', '2', '4']);
                queue.flush();
            });

            // Only Team1Component should re-render
            expect(team1RenderCount).toBeGreaterThan(initialTeam1Count);
            expect(team2RenderCount).toBe(initialTeam2Count);
            // Verify updated values are rendered correctly
            expect(getByTestId('team1').textContent).toBe('1, 2, 4');
            expect(getByTestId('team2').textContent).toBe('3');
        });

        test('should only re-render when index key changes (ArrayBased)', () => {
            const index = new OIMReactiveIndexManualArrayBased<string, string>(
                queue
            );

            index.setPks('team1', ['1', '2']);
            index.setPks('team2', ['3']);
            queue.flush();

            let team1RenderCount = 0;
            let team2RenderCount = 0;

            const Team1Component = () => {
                const pks = useSelectPksByIndexKeyArrayBased(index, 'team1');
                return (
                    <RenderTracker
                        onRender={() => {
                            team1RenderCount++;
                        }}
                    >
                        <div data-testid="team1">
                            {pks ? pks.join(', ') : ''}
                        </div>
                    </RenderTracker>
                );
            };

            const Team2Component = () => {
                const pks = useSelectPksByIndexKeyArrayBased(index, 'team2');
                return (
                    <RenderTracker
                        onRender={() => {
                            team2RenderCount++;
                        }}
                    >
                        <div data-testid="team2">
                            {pks ? pks.join(', ') : ''}
                        </div>
                    </RenderTracker>
                );
            };

            const { getByTestId } = render(
                <div>
                    <Team1Component />
                    <Team2Component />
                </div>
            );

            // Verify initial values are rendered correctly
            expect(getByTestId('team1').textContent).toBe('1, 2');
            expect(getByTestId('team2').textContent).toBe('3');

            const initialTeam1Count = team1RenderCount;
            const initialTeam2Count = team2RenderCount;

            // Update index for team1
            act(() => {
                index.setPks('team1', ['1', '2', '4']);
                queue.flush();
            });

            // Only Team1Component should re-render
            expect(team1RenderCount).toBeGreaterThan(initialTeam1Count);
            expect(team2RenderCount).toBe(initialTeam2Count);
            // Verify updated values are rendered correctly
            expect(getByTestId('team1').textContent).toBe('1, 2, 4');
            expect(getByTestId('team2').textContent).toBe('3');
        });
    });

    describe('useSelectPksByIndexKeys - minimum re-renders', () => {
        test('should only re-render when subscribed index keys change (SetBased)', () => {
            const index = new OIMReactiveIndexManualSetBased<string, string>(
                queue
            );

            index.setPks('team1', ['1', '2']);
            index.setPks('team2', ['3']);
            index.setPks('team3', ['4']);
            queue.flush();

            let team12RenderCount = 0;
            let team3RenderCount = 0;

            const Team12Component = () => {
                const pks = useSelectPksByIndexKeysSetBased(index, [
                    'team1',
                    'team2',
                ]);
                return (
                    <RenderTracker
                        onRender={() => {
                            team12RenderCount++;
                        }}
                    >
                        <div data-testid="team12">
                            {pks ? Array.from(pks).sort().join(', ') : ''}
                        </div>
                    </RenderTracker>
                );
            };

            const Team3Component = () => {
                const pks = useSelectPksByIndexKeysSetBased(index, ['team3']);
                return (
                    <RenderTracker
                        onRender={() => {
                            team3RenderCount++;
                        }}
                    >
                        <div data-testid="team3">
                            {pks ? Array.from(pks).join(', ') : ''}
                        </div>
                    </RenderTracker>
                );
            };

            const { getByTestId } = render(
                <div>
                    <Team12Component />
                    <Team3Component />
                </div>
            );

            // Verify initial values are rendered correctly
            expect(getByTestId('team12').textContent).toBe('1, 2, 3');
            expect(getByTestId('team3').textContent).toBe('4');

            const initialTeam12Count = team12RenderCount;
            const initialTeam3Count = team3RenderCount;

            // Update index for team1 (subscribed by Team12Component)
            act(() => {
                index.setPks('team1', ['1', '2', '5']);
                queue.flush();
            });

            // Only Team12Component should re-render
            expect(team12RenderCount).toBeGreaterThan(initialTeam12Count);
            expect(team3RenderCount).toBe(initialTeam3Count);
            // Verify updated values are rendered correctly
            expect(getByTestId('team12').textContent).toBe('1, 2, 3, 5');
            expect(getByTestId('team3').textContent).toBe('4');

            // Update index for team3 (unrelated to Team12Component)
            act(() => {
                index.setPks('team3', ['4', '6']);
                queue.flush();
            });

            // Only Team3Component should re-render
            expect(team3RenderCount).toBeGreaterThan(initialTeam3Count);
            // Verify updated values are rendered correctly
            expect(getByTestId('team12').textContent).toBe('1, 2, 3, 5');
            expect(getByTestId('team3').textContent).toBe('4, 6');
        });

        test('should only re-render when subscribed index keys change (ArrayBased)', () => {
            const index = new OIMReactiveIndexManualArrayBased<string, string>(
                queue
            );

            index.setPks('team1', ['1', '2']);
            index.setPks('team2', ['3']);
            index.setPks('team3', ['4']);
            queue.flush();

            let team12RenderCount = 0;
            let team3RenderCount = 0;

            const Team12Component = () => {
                const pks = useSelectPksByIndexKeysArrayBased(index, [
                    'team1',
                    'team2',
                ]);
                return (
                    <RenderTracker
                        onRender={() => {
                            team12RenderCount++;
                        }}
                    >
                        <div data-testid="team12">
                            {pks ? pks.join(', ') : ''}
                        </div>
                    </RenderTracker>
                );
            };

            const Team3Component = () => {
                const pks = useSelectPksByIndexKeysArrayBased(index, ['team3']);
                return (
                    <RenderTracker
                        onRender={() => {
                            team3RenderCount++;
                        }}
                    >
                        <div data-testid="team3">
                            {pks ? pks.join(', ') : ''}
                        </div>
                    </RenderTracker>
                );
            };

            const { getByTestId } = render(
                <div>
                    <Team12Component />
                    <Team3Component />
                </div>
            );

            // Verify initial values are rendered correctly
            expect(getByTestId('team12').textContent).toBe('1, 2, 3');
            expect(getByTestId('team3').textContent).toBe('4');

            const initialTeam12Count = team12RenderCount;
            const initialTeam3Count = team3RenderCount;

            // Update index for team1 (subscribed by Team12Component)
            act(() => {
                index.setPks('team1', ['1', '2', '5']);
                queue.flush();
            });

            // Only Team12Component should re-render
            expect(team12RenderCount).toBeGreaterThan(initialTeam12Count);
            expect(team3RenderCount).toBe(initialTeam3Count);
            // Verify updated values are rendered correctly
            // Order: first all from team1, then all from team2
            expect(getByTestId('team12').textContent).toBe('1, 2, 5, 3');
            expect(getByTestId('team3').textContent).toBe('4');

            // Update index for team3 (unrelated to Team12Component)
            act(() => {
                index.setPks('team3', ['4', '6']);
                queue.flush();
            });

            // Only Team3Component should re-render
            expect(team3RenderCount).toBeGreaterThan(initialTeam3Count);
            // Verify updated values are rendered correctly
            // Order: first all from team1, then all from team2
            expect(getByTestId('team12').textContent).toBe('1, 2, 5, 3');
            expect(getByTestId('team3').textContent).toBe('4, 6');
        });
    });

    describe('useSelectEntitiesByIndexKeys - minimum re-renders', () => {
        test('should only re-render when subscribed index keys change (SetBased)', () => {
            const index = new OIMReactiveIndexManualSetBased<string, string>(
                queue
            );

            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
                {
                    id: '3',
                    name: 'Charlie',
                    age: 35,
                    email: 'charlie@test.com',
                },
                { id: '4', name: 'David', age: 28, email: 'david@test.com' },
            ]);
            index.setPks('team1', ['1', '2']);
            index.setPks('team2', ['3']);
            index.setPks('team3', ['4']);
            queue.flush();

            let team12RenderCount = 0;
            let team3RenderCount = 0;

            const Team12Component = () => {
                const users = useSelectEntitiesByIndexKeysSetBased(
                    collection,
                    index,
                    ['team1', 'team2']
                );
                return (
                    <RenderTracker
                        onRender={() => {
                            team12RenderCount++;
                        }}
                    >
                        <div data-testid="team12">
                            {users?.map(u => u?.name).join(', ') || ''}
                        </div>
                    </RenderTracker>
                );
            };

            const Team3Component = () => {
                const users = useSelectEntitiesByIndexKeysSetBased(
                    collection,
                    index,
                    ['team3']
                );
                return (
                    <RenderTracker
                        onRender={() => {
                            team3RenderCount++;
                        }}
                    >
                        <div data-testid="team3">
                            {users?.map(u => u?.name).join(', ') || ''}
                        </div>
                    </RenderTracker>
                );
            };

            const { getByTestId } = render(
                <div>
                    <Team12Component />
                    <Team3Component />
                </div>
            );

            // Verify initial values are rendered correctly
            expect(getByTestId('team12').textContent).toBe(
                'Alice, Bob, Charlie'
            );
            expect(getByTestId('team3').textContent).toBe('David');

            const initialTeam12Count = team12RenderCount;
            const initialTeam3Count = team3RenderCount;

            // Update index for team1 (subscribed by Team12Component)
            act(() => {
                index.setPks('team1', ['1', '2', '4']);
                queue.flush();
            });

            // Only Team12Component should re-render
            expect(team12RenderCount).toBeGreaterThan(initialTeam12Count);
            expect(team3RenderCount).toBe(initialTeam3Count);
            // Verify updated values are rendered correctly
            // For SetBased, order is not guaranteed, so we check that all expected names are present
            const team12Text = getByTestId('team12').textContent;
            expect(team12Text).toContain('Alice');
            expect(team12Text).toContain('Bob');
            expect(team12Text).toContain('Charlie');
            expect(team12Text).toContain('David');
            expect(team12Text.split(', ').length).toBe(4);
            expect(getByTestId('team3').textContent).toBe('David');

            // Update entity '1' (in team1, subscribed by Team12Component)
            act(() => {
                collection.upsertOne({
                    id: '1',
                    name: 'Alice Updated',
                    age: 31,
                    email: 'alice@test.com',
                });
                queue.flush();
            });

            // Only Team12Component should re-render
            expect(team12RenderCount).toBeGreaterThan(initialTeam12Count);
            expect(team3RenderCount).toBe(initialTeam3Count);
            // Verify updated values are rendered correctly
            // For SetBased, order is not guaranteed, so we check that all expected names are present
            const team12TextUpdated = getByTestId('team12').textContent;
            expect(team12TextUpdated).toContain('Alice Updated');
            expect(team12TextUpdated).toContain('Bob');
            expect(team12TextUpdated).toContain('Charlie');
            expect(team12TextUpdated).toContain('David');
            expect(team12TextUpdated.split(', ').length).toBe(4);
            expect(getByTestId('team3').textContent).toBe('David');
        });

        test('should only re-render when subscribed index keys change (ArrayBased)', () => {
            const index = new OIMReactiveIndexManualArrayBased<string, string>(
                queue
            );

            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
                {
                    id: '3',
                    name: 'Charlie',
                    age: 35,
                    email: 'charlie@test.com',
                },
                { id: '4', name: 'David', age: 28, email: 'david@test.com' },
            ]);
            index.setPks('team1', ['1', '2']);
            index.setPks('team2', ['3']);
            index.setPks('team3', ['4']);
            queue.flush();

            let team12RenderCount = 0;
            let team3RenderCount = 0;

            const Team12Component = () => {
                const users = useSelectEntitiesByIndexKeysArrayBased(
                    collection,
                    index,
                    ['team1', 'team2']
                );
                return (
                    <RenderTracker
                        onRender={() => {
                            team12RenderCount++;
                        }}
                    >
                        <div data-testid="team12">
                            {users?.map(u => u?.name).join(', ') || ''}
                        </div>
                    </RenderTracker>
                );
            };

            const Team3Component = () => {
                const users = useSelectEntitiesByIndexKeysArrayBased(
                    collection,
                    index,
                    ['team3']
                );
                return (
                    <RenderTracker
                        onRender={() => {
                            team3RenderCount++;
                        }}
                    >
                        <div data-testid="team3">
                            {users?.map(u => u?.name).join(', ') || ''}
                        </div>
                    </RenderTracker>
                );
            };

            const { getByTestId } = render(
                <div>
                    <Team12Component />
                    <Team3Component />
                </div>
            );

            // Verify initial values are rendered correctly
            expect(getByTestId('team12').textContent).toBe(
                'Alice, Bob, Charlie'
            );
            expect(getByTestId('team3').textContent).toBe('David');

            const initialTeam12Count = team12RenderCount;
            const initialTeam3Count = team3RenderCount;

            // Update index for team1 (subscribed by Team12Component)
            act(() => {
                index.setPks('team1', ['1', '2', '4']);
                queue.flush();
            });

            // Only Team12Component should re-render
            expect(team12RenderCount).toBeGreaterThan(initialTeam12Count);
            expect(team3RenderCount).toBe(initialTeam3Count);
            // Verify updated values are rendered correctly
            // Order: first all from team1, then all from team2
            expect(getByTestId('team12').textContent).toBe(
                'Alice, Bob, David, Charlie'
            );
            expect(getByTestId('team3').textContent).toBe('David');

            // Update entity '1' (in team1, subscribed by Team12Component)
            act(() => {
                collection.upsertOne({
                    id: '1',
                    name: 'Alice Updated',
                    age: 31,
                    email: 'alice@test.com',
                });
                queue.flush();
            });

            // Only Team12Component should re-render
            expect(team12RenderCount).toBeGreaterThan(initialTeam12Count);
            expect(team3RenderCount).toBe(initialTeam3Count);
            // Verify updated values are rendered correctly
            // Order: first all from team1, then all from team2
            expect(getByTestId('team12').textContent).toBe(
                'Alice Updated, Bob, David, Charlie'
            );
            expect(getByTestId('team3').textContent).toBe('David');
        });
    });
});
