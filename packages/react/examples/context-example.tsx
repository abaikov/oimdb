import * as React from 'react';
import {
    OIMCollectionsProvider,
    useOIMCollectionsContext,
} from '../src/context/index';
import {
    OIMEventQueue,
    OIMReactiveCollection,
    OIMReactiveCollectionIndexManualArrayBased,
} from '@oimdb/core';
import {
    useSelectEntitiesByPks,
    useSelectEntitiesByIndexKeyArrayBased,
} from '../src/hooks/index';

interface User {
    id: string;
    name: string;
    email: string;
    teamId: string;
    role: 'admin' | 'user';
}

interface Team {
    id: string;
    name: string;
    department: string;
}

function createCollections() {
    const queue = new OIMEventQueue();

    const usersCollection = new OIMReactiveCollection<User, string>(queue, {
        selectPk: (user: User) => user.id,
    });

    const userTeamIndex = new OIMReactiveCollectionIndexManualArrayBased<
        string,
        string,
        User
    >(queue, {
        collection: usersCollection,
    });

    const teamsCollection = new OIMReactiveCollection<Team, string>(queue, {
        selectPk: (team: Team) => team.id,
    });

    // Add some sample data
    setTimeout(() => {
        // Sample teams
        teamsCollection.upsertMany([
            { id: 'team1', name: 'Engineering', department: 'Technology' },
            { id: 'team2', name: 'Design', department: 'Product' },
            { id: 'team3', name: 'Marketing', department: 'Business' },
        ]);

        // Sample users
        usersCollection.upsertMany([
            {
                id: 'user1',
                name: 'John Doe',
                email: 'john@example.com',
                teamId: 'team1',
                role: 'admin',
            },
            {
                id: 'user2',
                name: 'Jane Smith',
                email: 'jane@example.com',
                teamId: 'team1',
                role: 'user',
            },
            {
                id: 'user3',
                name: 'Bob Wilson',
                email: 'bob@example.com',
                teamId: 'team2',
                role: 'user',
            },
            {
                id: 'user4',
                name: 'Alice Brown',
                email: 'alice@example.com',
                teamId: 'team3',
                role: 'admin',
            },
        ]);

        // Update indexes
        userTeamIndex.setPks('team1', ['user1', 'user2']);
        userTeamIndex.setPks('team2', ['user3']);
        userTeamIndex.setPks('team3', ['user4']);
    }, 100);

    return {
        collections: {
            users: usersCollection,
            teams: teamsCollection,
        },
        indexes: {
            usersByTeam: userTeamIndex,
        },
    };
}

// Extract type using typeof to preserve collection generic types
type AppCollections = ReturnType<typeof createCollections>['collections'];
type AppIndexes = ReturnType<typeof createCollections>['indexes'];

function TeamMembersList({
    teamId,
    indexes,
}: {
    teamId: string;
    indexes: AppIndexes;
}) {
    const { users } = useOIMCollectionsContext<AppCollections>();

    // Get users for specific team using your existing hooks
    const teamUsers = useSelectEntitiesByIndexKeyArrayBased(
        users,
        indexes.usersByTeam,
        teamId
    );

    // Filter out undefined values and ensure type safety
    const validUsers = (teamUsers || []).filter(
        (user): user is User => user !== undefined
    );

    return (
        <div style={{ marginLeft: 20, marginTop: 10 }}>
            <h4>Team Members:</h4>
            {validUsers.length === 0 ? (
                <p>No members</p>
            ) : (
                <ul>
                    {validUsers.map(user => (
                        <li key={user.id} style={{ marginBottom: 5 }}>
                            <strong>{user.name}</strong> ({user.role})
                            <br />
                            <small>{user.email}</small>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function TeamsAndUsers({ indexes }: { indexes: AppIndexes }) {
    const { teams } = useOIMCollectionsContext<AppCollections>();

    // Get all teams using your existing hooks
    const allTeams = useSelectEntitiesByPks(teams, []) ?? [];
    const validTeams = allTeams.filter(
        (team): team is Team => team !== undefined
    );

    return (
        <div style={{ padding: 20 }}>
            <h2>Teams & Users</h2>
            {validTeams.length === 0 ? (
                <p>Loading teams...</p>
            ) : (
                <div>
                    {validTeams.map(team => (
                        <div
                            key={team.id}
                            style={{
                                border: '1px solid #ccc',
                                padding: 15,
                                marginBottom: 15,
                                borderRadius: 5,
                            }}
                        >
                            <h3>{team.name}</h3>
                            <p>Department: {team.department}</p>
                            <TeamMembersList
                                teamId={team.id}
                                indexes={indexes}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function UserStats() {
    const { users } = useOIMCollectionsContext<AppCollections>();

    const allUsers = useSelectEntitiesByPks(users, []) ?? [];
    const validUsers = allUsers.filter(
        (user): user is User => user !== undefined
    );
    const adminCount = validUsers.filter(user => user.role === 'admin').length;
    const userCount = validUsers.filter(user => user.role === 'user').length;

    return (
        <div
            style={{
                padding: 20,
                backgroundColor: '#f5f5f5',
                borderRadius: 5,
                margin: 20,
            }}
        >
            <h3>User Statistics</h3>
            <p>Total Users: {validUsers.length}</p>
            <p>Admins: {adminCount}</p>
            <p>Regular Users: {userCount}</p>
        </div>
    );
}

function App() {
    const { collections, indexes } = React.useMemo(
        () => createCollections(),
        []
    );

    return (
        <OIMCollectionsProvider collections={collections}>
            <div style={{ fontFamily: 'Arial, sans-serif' }}>
                <header
                    style={{
                        backgroundColor: '#333',
                        color: 'white',
                        padding: 20,
                        textAlign: 'center',
                    }}
                >
                    <h1>OIMDB Collections Demo</h1>
                    <p>Real-world example with teams and users</p>
                </header>
                <UserStats />
                <TeamsAndUsers indexes={indexes} />
            </div>
        </OIMCollectionsProvider>
    );
}

export default App;
