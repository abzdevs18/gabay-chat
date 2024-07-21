import React from 'react';
import Login from 'matrix-react-sdk/src/components/structures/auth/Login';
import SdkConfig from 'matrix-react-sdk/src/SdkConfig';
import { ValidatedServerConfig } from 'matrix-react-sdk/src/utils/ValidatedServerConfig';

interface IProps {
    onLoggedIn: () => void;
}

const EmbeddedLogin: React.FC<IProps> = ({ onLoggedIn }) => {
    // Get the homeserver URL from the SdkConfig
    const hsUrl = SdkConfig.get("default_server_config")?.["m.homeserver"]?.base_url 
        || "https://matrix.org";

    // Create a server config object that matches the ValidatedServerConfig type
    const serverConfig: ValidatedServerConfig = {
        hsUrl,
        isUrl: SdkConfig.get("default_server_config")?.["m.identity_server"]?.base_url || "",
        hsName: SdkConfig.get("default_server_name") || "Matrix.org",
        hsNameIsDifferent: false,
        warning: "",
        isDefault: true,  // Add this property
        isNameResolvable: true,  // Add this property
    };

    return (
        <Login
            serverConfig={serverConfig}
            onLoggedIn={onLoggedIn}
            isSyncing={false}
            onRegisterClick={() => {}}
            defaultDeviceDisplayName="Embedded Element"
            onServerConfigChange={() => {}}
        />
    );
};

export default EmbeddedLogin;