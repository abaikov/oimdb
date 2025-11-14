import * as React from 'react';
import {
    OIMRICollectionsProvider,
    useOIMCollectionsContext,
} from '../src/context/index';
import {
    OIMRICollection,
    OIMEventQueue,
    OIMReactiveIndexManualArrayBased,
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

    const userTeamIndex = new OIMReactiveIndexManualArrayBased<string, string>(
        queue
    );
    const usersCollection = new OIMRICollection(queue, {
        collectionOpts: { selectPk: (user: User) => user.id },
        indexes: { byTeam: userTeamIndex },
    });

    const teamsCollection = new OIMRICollection(queue, {
        collectionOpts: { selectPk: (team: Team) => team.id },
        indexes: {},
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
        usersCollection.indexes.byTeam.setPks('team1', ['user1', 'user2']);
        usersCollection.indexes.byTeam.setPks('team2', ['user3']);
        usersCollection.indexes.byTeam.setPks('team3', ['user4']);
    }, 100);

    const collections = {
        users: usersCollection,
        teams: teamsCollection,
    };
    return collections;
}

// Extract type using typeof to preserve collection generic types
type AppCollections = ReturnType<typeof createCollections>;

function TeamMembersList({ teamId }: { teamId: string }) {
    const { users } = useOIMCollectionsContext<AppCollections>();

    // Get users for specific team using your existing hooks
    const teamUsers = useSelectEntitiesByIndexKeyArrayBased(
        users,
        users.indexes.byTeam,
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

function TeamsAndUsers() {
    const { teams } = useOIMCollectionsContext<AppCollections>();

    // Get all teams using your existing hooks
    const allTeams = useSelectEntitiesByPks(teams, []);

    return (
        <div style={{ padding: 20 }}>
            <h2>Teams & Users</h2>
            {allTeams.length === 0 ? (
                <p>Loading teams...</p>
            ) : (
                <div>
                    {allTeams.map(team => (
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
                            <TeamMembersList teamId={team.id} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function UserStats() {
    const { users } = useOIMCollectionsContext<AppCollections>();

    const allUsers = useSelectEntitiesByPks(users, []);
    const adminCount = allUsers.filter(user => user.role === 'admin').length;
    const userCount = allUsers.filter(user => user.role === 'user').length;

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
            <p>Total Users: {allUsers.length}</p>
            <p>Admins: {adminCount}</p>
            <p>Regular Users: {userCount}</p>
        </div>
    );
}

function App() {
    const collections = React.useMemo(() => createCollections(), []);

    return (
        <OIMRICollectionsProvider collections={collections}>
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
                <TeamsAndUsers />
            </div>
        </OIMRICollectionsProvider>
    );
}

export default App;
