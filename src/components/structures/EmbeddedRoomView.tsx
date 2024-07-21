import React, { useEffect, useState, useMemo } from 'react';
import { MatrixClientPeg } from 'matrix-react-sdk/src/MatrixClientPeg';
import RoomView from 'matrix-react-sdk/src/components/structures/RoomView';
import { MatrixClient } from 'matrix-js-sdk/src/client';
import dis from 'matrix-react-sdk/src/dispatcher/dispatcher';
import { Action } from 'matrix-react-sdk/src/dispatcher/actions';
import ResizeNotifier from 'matrix-react-sdk/src/utils/ResizeNotifier';

interface EmbeddedRoomViewProps {
    roomId: string;
}

const IframeEmbeddedRoomView: React.FC<EmbeddedRoomViewProps> = ({ roomId }) => {
    const [client, setClient] = useState<MatrixClient | null>(null);

    // Create a ResizeNotifier instance
    const resizeNotifier = useMemo(() => new ResizeNotifier(), []);

    useEffect(() => {
        const checkClient = () => {
            const currentClient = MatrixClientPeg.get();
            if (currentClient && currentClient !== client) {
                setClient(currentClient);
            }
        };

        // Check immediately and set up an interval
        checkClient();
        const intervalId = setInterval(checkClient, 1000);

        return () => clearInterval(intervalId);
    }, [client]);

    useEffect(() => {
        if (client && roomId) {
            // Dispatch an action to view the room
            dis.dispatch({
                action: Action.ViewRoom,
                room_id: roomId,
                metricsTrigger: undefined,
            });
        }
    }, [client, roomId]);

    if (!client) {
        return <div>Loading...</div>;
    }

    return (
        <div className="mx_EmbeddedRoomView">
            <RoomView 
                resizeNotifier={resizeNotifier}
                onRegistered={() => {}} // Add an empty function or appropriate handler
                threepidInvite={undefined}
                oobData={undefined}
            />
        </div>
    );
};

export default IframeEmbeddedRoomView;