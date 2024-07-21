import { logger } from "matrix-js-sdk/src/logger";
import { extractErrorMessageFromError } from "matrix-react-sdk/src/components/views/dialogs/ErrorDialog";

// These are things that can run before the skin loads - be careful not to reference the react-sdk though.
import { parseQsFromFragment } from "./url_utils";
import ReactDOM from 'react-dom';
import EmbeddedRoomView from '../components/structures/EmbeddedRoomView';
import "./modernizr";
import { getMatrixUtils } from './matrixUtils';

// Add these new imports
import { createClient, IndexedDBCryptoStore } from 'matrix-js-sdk';
import { MatrixClientPeg } from 'matrix-react-sdk/src/MatrixClientPeg';
// import * as Olm from '@matrix-org/olm';
// window.Olm = Olm;

// import MockMatrixClient from '../mock-matrix-client';
// // Add this import at the top of the file if it's not already there
// import { MatrixClientPeg } from "matrix-react-sdk/src/MatrixClientPeg";

// Require common CSS here; this will make webpack process it into bundle.css.
// Our own CSS (which is themed) is imported via separate webpack entry points
// in webpack.config.js
require("katex/dist/katex.css");

/**
 * This require is necessary only for purposes of CSS hot-reload, as otherwise
 * webpack has some incredible problems figuring out which CSS files should be
 * hot-reloaded, even with proper hints for the loader.
 *
 * On production build it's going to be an empty module, so don't worry about that.
 */
require("./devcss");
require("./localstorage-fix");


let matrixClient: any = null;

function checkForExistingSession() {
    const accessToken = localStorage.getItem('mx_access_token');
    const userId = localStorage.getItem('mx_user_id');
    const deviceId = localStorage.getItem('mx_device_id');
    const homeserverUrl = localStorage.getItem('mx_hs_url');

    if (accessToken && userId && deviceId && homeserverUrl) {
        return { accessToken, userId, deviceId, homeserverUrl };
    }
    return null;
}

// Add this function
// async function initOlm() {
//     await Olm.init();
//     console.log("Olm initialized");
// }

async function clearCryptoStore() {
    const indexedDB = window.indexedDB;
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase("matrix-js-sdk:crypto");
      req.onerror = () => reject(new Error("Failed to delete crypto store"));
      req.onsuccess = () => resolve();
    });
  }

async function handleLogin(homeserverUrl: string, username: string, password: string) {
    try {
      const loginResponse = await performLogin(homeserverUrl, username, password);
      const client = await initializeMatrixClient(
        homeserverUrl,
        loginResponse.access_token,
        loginResponse.user_id
      );
      // Additional setup with the initialized client if needed
    } catch (error) {
      console.error('Login process failed:', error);
      window.parent.postMessage({ type: 'loginFailure', error: error }, '*');
    }
  }

async function initializeMatrixClient(homeserverUrl: string, accessToken: string, userId: string) {
    let deviceId:any = getStoredDeviceId();
    if (!deviceId) {
      // If no stored device ID, we'll get a new one from the server
      deviceId = ""; // The server will allocate a new device ID
    }
    try {
        console.log("Clearing crypto store...");
        await clearCryptoStore();
    
        console.log("Initializing Matrix client...");
        const client = createClient({
          baseUrl: homeserverUrl,
          accessToken: accessToken,
          userId: userId,
          deviceId: deviceId,
          cryptoStore: new IndexedDBCryptoStore(window.indexedDB, "matrix-js-sdk:crypto"),
        });

        // After successful initialization, store the device ID
        storeDeviceId(client.getDeviceId());
        
      
      MatrixClientPeg.replaceUsingCreds({
        accessToken,
        homeserverUrl,
        userId,
        deviceId,
      });
  
      console.log("Initializing crypto...");
      await client.initCrypto();
      console.log("Starting client...");
      await client.startClient({ initialSyncLimit: 10 });
      
      // Save session data
      localStorage.setItem('mx_access_token', accessToken);
      localStorage.setItem('mx_user_id', userId);
      localStorage.setItem('mx_hs_url', homeserverUrl);
      localStorage.setItem('mx_device_id', deviceId);
  
      console.log("Client started successfully. Sending loginSuccess message.");
      window.parent.postMessage({ type: 'loginSuccess' }, '*');
      return client;
    } catch (error:any) {
        if (error.includes("the account in the store doesn't match the account in the constructor")) {
          console.error("Account mismatch detected. Clearing crypto store and retrying...");
          await clearCryptoStore();
          // Retry initialization
          return initializeMatrixClient(homeserverUrl, accessToken, userId);
        } else {
          console.error('Failed to initialize client:', error);
          throw error;
        }
    }
  }

async function performLogin(homeserverUrl: string, username: string, password: string) {
try {
    const tempClient = createClient({
    baseUrl: homeserverUrl,
    timelineSupport: true,
    });
    console.log('Temp client created');
    const loginResponse = await tempClient.login('m.login.password', {
    user: username,
    password: password,
    });
    console.log('Login response received:', loginResponse);
    return loginResponse;
} catch (error) {
    console.error('Login failed:', error);
    throw error;
}
}

window.addEventListener('message', async (event) => {
  if (event.source !== window.parent) return;

  switch (event.data.type) {
    case 'restoreSession':
    case 'existingSession':
        try {
        await initializeMatrixClient(event.data.homeserverUrl, event.data.accessToken, event.data.userId);
        } catch (error) {
        console.error('Failed to restore session:', error);
        window.parent.postMessage({ type: 'sessionLoadFailed', error: error }, '*');
        }
        break;
    case 'login':
        try {
        console.log("Attempting login...");
        await performLogin(event.data.homeserverUrl, event.data.username, event.data.password);
        } catch (error) {
        console.error('Login failed:', error);
        window.parent.postMessage({ type: 'loginFailure', error: error }, '*');
        }
        break;
    case 'selectRoom':
      if (matrixClient) {
        matrixClient.joinRoom(event.data.roomId).then(() => {
          // Use your app's method to switch to the room
          // For example:
          // dis.dispatch({ action: 'view_room', room_id: event.data.roomId });
          window.parent.postMessage({ type: 'roomSelected', roomId: event.data.roomId }, '*');
        }).catch((error: any) => {
          console.log('Failed to join room:', error);
        });
      }
      break;
  }
});

// When the page is loaded, notify the parent
window.addEventListener('load', () => {
  window.parent.postMessage({ type: 'ready' }, '*');
});

async function settled(...promises: Array<Promise<any>>): Promise<void> {
    for (const prom of promises) {
        try {
            await prom;
        } catch (e) {
            logger.error(e);
        }
    }
}

function checkBrowserFeatures(): boolean {
    if (!window.Modernizr) {
        logger.error("Cannot check features - Modernizr global is missing.");
        return false;
    }

    // Custom checks atop Modernizr because it doesn't have checks in it for
    // some features we depend on.
    // Modernizr requires rules to be lowercase with no punctuation.
    // ES2018: http://262.ecma-international.org/9.0/#sec-promise.prototype.finally
    window.Modernizr.addTest("promiseprototypefinally", () => typeof window.Promise?.prototype?.finally === "function");
    // ES2020: http://262.ecma-international.org/#sec-promise.allsettled
    window.Modernizr.addTest("promiseallsettled", () => typeof window.Promise?.allSettled === "function");
    // ES2018: https://262.ecma-international.org/9.0/#sec-get-regexp.prototype.dotAll
    window.Modernizr.addTest(
        "regexpdotall",
        () => window.RegExp?.prototype && !!Object.getOwnPropertyDescriptor(window.RegExp.prototype, "dotAll")?.get,
    );
    // ES2019: http://262.ecma-international.org/10.0/#sec-object.fromentries
    window.Modernizr.addTest("objectfromentries", () => typeof window.Object?.fromEntries === "function");
    // ES2024: https://tc39.es/ecma262/2024/#sec-get-regexp.prototype.unicodesets
    window.Modernizr.addTest(
        "regexpunicodesets",
        () => window.RegExp?.prototype && "unicodeSets" in window.RegExp.prototype,
    );
    // ES2024: https://402.ecma-international.org/9.0/#sec-intl.segmenter
    window.Modernizr.addTest("intlsegmenter", () => typeof window.Intl?.Segmenter === "function");

    const featureList = Object.keys(window.Modernizr) as Array<keyof ModernizrStatic>;

    let featureComplete = true;
    for (const feature of featureList) {
        if (window.Modernizr[feature] === undefined) {
            logger.error(
                "Looked for feature '%s' but Modernizr has no results for this. " + "Has it been configured correctly?",
                feature,
            );
            return false;
        }
        if (window.Modernizr[feature] === false) {
            logger.error("Browser missing feature: '%s'", feature);
            // toggle flag rather than return early so we log all missing features rather than just the first.
            featureComplete = false;
        }
    }
    return featureComplete;
}

function getStoredDeviceId() {
return localStorage.getItem('mx_device_id');
}

function storeDeviceId(deviceId: any) {
localStorage.setItem('mx_device_id', deviceId);
}

const supportedBrowser = checkBrowserFeatures();

// React depends on Map & Set which we check for using modernizr's es6collections
// if modernizr fails we may not have a functional react to show the error message.
// try in react but fallback to an `alert`
// We start loading stuff but don't block on it until as late as possible to allow
// the browser to use as much parallelism as it can.
// Load parallelism is based on research in https://github.com/element-hq/element-web/issues/12253
async function start(): Promise<void> {
    // load init.ts async so that its code is not executed immediately and we can catch any exceptions
    const {
        rageshakePromise,
        setupLogStorage,
        preparePlatform,
        loadConfig,
        loadLanguage,
        loadTheme,
        loadApp,
        loadModules,
        showError,
        showIncompatibleBrowser,
        _t,
    } = await import(
        /* webpackChunkName: "init" */
        /* webpackPreload: true */
        "./init"
    );

    try {
        // await initOlm();
        const fragparts = parseQsFromFragment(window.location);

        // Add this block right here, after the imports and at the start of the try block
        const existingSession = checkForExistingSession();
        if (existingSession) {
            try {
                await initializeMatrixClient(
                    existingSession.homeserverUrl,
                    existingSession.accessToken,
                    existingSession.userId
                );
                // Load the app with existing session
                await loadApp(fragparts.params);
                return; // Exit the function if successful
            } catch (error) {
                console.error("Failed to load existing session:", error);
                // Optionally, clear storage here if the session is invalid
            }
        }

        // give rageshake a chance to load/fail, we don't actually assert rageshake loads, we allow it to fail if no IDB
        await settled(rageshakePromise);

        // don't try to redirect to the native apps if we're
        // verifying a 3pid (but after we've loaded the config)
        // or if the user is following a deep link
        // (https://github.com/element-hq/element-web/issues/7378)
        const preventRedirect = fragparts.params.client_secret || fragparts.location.length > 0;

        if (!preventRedirect) {
            const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            const isAndroid = /Android/.test(navigator.userAgent);
            if (isIos || isAndroid) {
                if (document.cookie.indexOf("element_mobile_redirect_to_guide=false") === -1) {
                    window.location.href = "mobile_guide/";
                    return;
                }
            }
        }

        // set the platform for react sdk
        preparePlatform();
        // load config requires the platform to be ready
        const loadConfigPromise = loadConfig();
        await settled(loadConfigPromise); // wait for it to settle
        // keep initialising so that we can show any possible error with as many features (theme, i18n) as possible

        // now that the config is ready, try to persist logs
        const persistLogsPromise = setupLogStorage();

        // Load modules before language to ensure any custom translations are respected, and any app
        // startup functionality is run
        const loadModulesPromise = loadModules();
        await settled(loadModulesPromise);

        // Load language after loading config.json so that settingsDefaults.language can be applied
        const loadLanguagePromise = loadLanguage();
        // as quickly as we possibly can, set a default theme...
        const loadThemePromise = loadTheme();

        // await things settling so that any errors we have to render have features like i18n running
        await settled(loadThemePromise, loadLanguagePromise);

        // let acceptBrowser = supportedBrowser;
        // if (!acceptBrowser && window.localStorage) {
        //     acceptBrowser = Boolean(window.localStorage.getItem("mx_accepts_unsupported_browser"));
        // }

        // ##########################
        // error handling begins here
        // ##########################
        // if (!acceptBrowser) {
        //     await new Promise<void>((resolve, reject) => {
        //         logger.error("Browser is missing required features.");
        //         // take to a different landing page to AWOOOOOGA at the user
        //         showIncompatibleBrowser(() => {
        //             if (window.localStorage) {
        //                 window.localStorage.setItem("mx_accepts_unsupported_browser", String(true));
        //             }
        //             logger.log("User accepts the compatibility risks.");
        //             resolve();
        //         }).catch(reject);
        //     });
        // }

        try {
            // await config here
            await loadConfigPromise;
        } catch (error) {
            // Now that we've loaded the theme (CSS), display the config syntax error if needed.
            if (error instanceof SyntaxError) {
                // This uses the default brand since the app config is unavailable.
                return showError(_t("error|misconfigured"), [
                    _t("error|invalid_json"),
                    _t("error|invalid_json_detail", {
                        message: error.message || _t("error|invalid_json_generic"),
                    }),
                ]);
            }
            return showError(_t("error|cannot_load_config"));
        }

        // ##################################
        // app load critical path starts here
        // assert things started successfully
        // ##################################
        await loadModulesPromise;
        await loadThemePromise;
        await loadLanguagePromise;

        // We don't care if the log persistence made it through successfully, but we do want to
        // make sure it had a chance to load before we move on. It's prepared much higher up in
        // the process, making this the first time we check that it did something.
        await settled(persistLogsPromise);// Add this near the beginning of the try block

        const isInIframe = window !== window.parent;
        logger.info("awss");

        if (isInIframe) {
            logger.info("Setting up message listener in iframe");

            // Add this near the start of your file
            function injectErrorHandler() {
                const targetNode = document.body;
                const config = { childList: true, subtree: true };
                
                const callback = function(mutationsList:any, observer:any) {
                for(let mutation of mutationsList) {
                    if (mutation.type === 'childList') {
                    const errorElement = document.querySelector('.mx_ErrorMessage');
                    if (errorElement && errorElement?.textContent?.includes('Unable to restore session')) {
                        window.parent.postMessage({ type: 'unableToRestoreSession' }, '*');
                        observer.disconnect(); // Stop observing once we've found the error
                    }
                    }
                }
                };
                
                const observer = new MutationObserver(callback);
                observer.observe(targetNode, config);
            }
            
            // Call this function after the DOM has loaded
            document.addEventListener('DOMContentLoaded', injectErrorHandler);

            function overrideClearStorageButton() {
                document.addEventListener('click', function(event) {
                  const target = event.target as HTMLElement;
                  if (target.textContent === 'Clear Storage and Sign Out') {
                    event.preventDefault();
                    event.stopPropagation();
                    window.parent.postMessage({ type: 'unableToRestoreSession' }, '*');
                  }
                }, true);
              }
              
              // Call this function after the DOM has loaded
              document.addEventListener('DOMContentLoaded', overrideClearStorageButton);

            window.addEventListener('message', async (event) => {
                if (event.source !== window.parent) return;
                logger.info("Data Type Session:: ", event.data)

                if (event.data.type === 'checkReady') {
                    logger.info("Check ready received");
                    window.parent.postMessage({ type: 'ready' }, '*');
                } else if (event.data.type === 'login') {
                    const { username, password, homeserverUrl } = event.data;
                    
                    await loadConfigPromise;
                
                    try {
                        const { createClient } = await import("matrix-js-sdk");
                        const { MatrixClientPeg } = await import("matrix-react-sdk/src/MatrixClientPeg");
                        const { IndexedDBCryptoStore } = await import("matrix-js-sdk/src/crypto/store/indexeddb-crypto-store");
                
                        async function loginMatrixAccount(homeserverUrl: string, username: string, password: string): Promise<any> {
                            const tempClient = createClient({ baseUrl: homeserverUrl });
                            const loginData = await tempClient.login('m.login.password', {
                                user: username,
                                password: password,
                            });
                
                            // Notify the parent window that login is complete
                            window.parent.postMessage({ type: 'loginComplete', ...loginData }, '*');
                            return loginData;
                        }
                
                        const loginResult = await loginMatrixAccount(homeserverUrl, username, password);
                        console.log("loginResult:: ", loginResult);
                
                        // Initialize the crypto store
                        const cryptoStore = new IndexedDBCryptoStore(
                            window.indexedDB,
                            "matrix-js-sdk:crypto"
                        );
                
                        // Create a new client
                        const client = createClient({
                            baseUrl: homeserverUrl,
                            userId: loginResult.user_id,
                            deviceId: loginResult.device_id,
                            accessToken: loginResult.access_token,
                            cryptoStore: cryptoStore,
                            timelineSupport: true,
                        });
                
                        // Set the new client
                        MatrixClientPeg.replaceUsingCreds({
                            accessToken: loginResult.access_token,
                            homeserverUrl: homeserverUrl,
                            userId: loginResult.user_id,
                            deviceId: loginResult.device_id
                        });
                
                        // Start the client
                        await client.startClient({ initialSyncLimit: 10 });
                
                        // Set values in local storage
                        localStorage.setItem('mx_has_access_token', 'true');
                        localStorage.setItem('mx_hs_url', homeserverUrl);
                        localStorage.setItem('mx_user_id', loginResult.user_id);
                        localStorage.setItem('mx_device_id', loginResult.device_id);
                        localStorage.setItem('mx_access_token', loginResult.access_token);
                        localStorage.setItem('mx_is_guest', 'false');
                
                        // Load the app
                        await loadApp(fragparts.params);
                
                        // Notify the parent window that the session is ready
                        window.parent.postMessage({ type: 'loginSuccess' }, '*');
                    } catch (error) {
                        console.error("Login failed:", error);
                        // Notify the parent window that login failed
                        window.parent.postMessage({ type: 'loginFailure', error: error }, '*');
                    }
                } else if (event.data.type === 'existingSession') {
                    logger.info("Existing Session from parent iFrame")
                    const { accessToken, userId, deviceId, homeserverUrl } = event.data;
                    
                    await loadConfigPromise;

                    try {
                        const { createClient } = await import("matrix-js-sdk");
                        const { MatrixClientPeg } = await import("matrix-react-sdk/src/MatrixClientPeg");
                        const { IndexedDBCryptoStore } = await import("matrix-js-sdk/src/crypto/store/indexeddb-crypto-store");

                        // Initialize the crypto store
                        const cryptoStore = new IndexedDBCryptoStore(
                            window.indexedDB,
                            "matrix-js-sdk:crypto"
                        );

                        // Create a new client with existing session details
                        const client = createClient({
                            baseUrl: homeserverUrl,
                            userId: userId,
                            deviceId: deviceId,
                            accessToken: accessToken, // Make sure to include the device_id from the login response
                            cryptoStore: new IndexedDBCryptoStore(window.indexedDB, "matrix-js-sdk:crypto"),
                            timelineSupport: true,
                        });

                        // Set the new client
                        MatrixClientPeg.get = () => client;

                        // Start the client
                        await client.startClient();

                        // Set values in local storage
                        localStorage.setItem('mx_has_access_token', 'true');
                        localStorage.setItem('mx_hs_url', homeserverUrl);
                        localStorage.setItem('mx_user_id', userId);
                        localStorage.setItem('mx_device_id', deviceId);
                        localStorage.setItem('mx_access_token', accessToken);
                        localStorage.setItem('mx_is_guest', 'false');

                        // Load the app
                        await loadApp(fragparts.params);

                        document.addEventListener('DOMContentLoaded', () => {
                            const style = document.createElement('style');
                            style.type = 'text/css';
                            style.innerHTML = `
                              .mx_SpacePanel,
                              .mx_MatrixChat_wrapper .mx_ToastContainer,
                              .mx_AccessibleButton[aria-label="Explore rooms"] {
                                display: none !important;
                              }
                            `;
                            document.head.appendChild(style);
                          });
                          

                        // Hide the .mx_SpacePanel and .mx_ToastContainer sections
                        const elementsToHide = document.querySelectorAll('.mx_SpacePanel, .mx_MatrixChat_wrapper .mx_ToastContainer, .mx_SearchWarning');
                        elementsToHide.forEach((element) => {
                            if (element instanceof HTMLElement) {
                                element.style.display = 'none !important';
                            }
                        });

                        // Target the element with class 'mx_AccessibleButton mx_LeftPanel_exploreButton' and aria-label 'Explore rooms'
                        // const exploreRoomsButton = document.querySelector('.mx_AccessibleButton.[aria-label="Explore rooms"]') as HTMLElement;;
                        // if (exploreRoomsButton) {
                        //     exploreRoomsButton.style.display = 'none !important';
                        // }


                        // Notify the parent window that the session is ready
                        window.parent.postMessage({ type: 'existingSessionLoaded' }, '*');
                    } catch (error) {
                        console.error("Failed to load existing session:", error);
                        window.parent.postMessage({ type: 'sessionLoadFailed', error: error }, '*');
                    }
                } else if (event.data.type === 'logout') {
                    // console.log("Logout all sessions");
                    // window.parent.postMessage({ type: 'logoutComplete' }, '*');
                    try {
                        const { MatrixClientPeg } = await import("matrix-react-sdk/src/MatrixClientPeg");
                        const client = MatrixClientPeg.get();
                
                        if (client && client.isLoggedIn()) {
                            // Logout all sessions
                            const accessToken = client.getAccessToken();
                            
                            const response = await fetch('https://chat.gabay.online/_matrix/client/r0/logout/all', {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${accessToken}`,
                                    'Content-Type': 'application/json'
                                }
                            });
                        
                            if (response.ok) {
                        
                                // The rest of your logout code remains the same
                                client.stopClient();
                            
                                localStorage.removeItem('mx_has_access_token');
                                localStorage.removeItem('mx_hs_url');
                                localStorage.removeItem('mx_user_id');
                                localStorage.removeItem('mx_device_id');
                                localStorage.removeItem('mx_access_token');
                                localStorage.removeItem('mx_is_guest');
                            
                                MatrixClientPeg.unset();
                            
                                window.parent.postMessage({ type: 'logoutComplete' }, '*');
                            
                                console.log("Logout all sessions successful");
                            } else {
                                console.error("Failed to logout. Status: ", response.status);
                            }
                        } else {
                            window.parent.postMessage({ type: 'logoutComplete', info: 'No active session' }, '*');
                            console.log("No active session to logout");
                        }
                    } catch (error) {
                        console.error("Logout all sessions failed:", error);
                        window.parent.postMessage({ type: 'logoutAllFailed', error }, '*');
                    }
                } else if (event.data.type === 'selectRoom') {
                    try {
                        const { roomId } = event.data;
        
                        const dis = await import("matrix-react-sdk/src/dispatcher/dispatcher");
                        const { createClient } = await import("matrix-js-sdk");
                        const { MatrixClientPeg } = await import("matrix-react-sdk/src/MatrixClientPeg");
                        
                        // Function to ensure the client is properly initialized and authenticated
                        // const initializeClient = async () => {
                        //     const client = MatrixClientPeg.get();

                        //     client.stopClient();
                        //     client.store.deleteAllData().then(() => {
                        //         console.log("Store cleared");
                        //         return client.startClient({initialSyncLimit: 50});
                        //         }).then(() => {
                        //         console.log("Full sync completed");
                        //         console.log("Number of rooms:", client.getRooms().length);
                        //         }).catch(error => {
                        //         console.error("Sync failed:", error);
                        //     });



                        //     if (!client) {
                        //         console.error('Matrix client not initialized');
                        //         return;
                        //     }
                        
                        //     return new Promise((resolve, reject) => {
                        //         client.once('sync', (state) => {
                        //             if (state === 'PREPARED' || state === 'SYNCING') {
                        //                 resolve(client);
                        //             } else if (state === 'ERROR') {
                        //                 reject(new Error('Error syncing Matrix client'));
                        //             }
                        //         });
                        
                        //         // Start the client to sync
                        //         client.startClient({ initialSyncLimit: 10 });
                        //     });
                        // };
                        
                        // // Function to fetch joined rooms
                        // const fetchJoinedRooms = async () => {
                        //     try {
                        //         const client = await initializeClient();
                        //         if (!client) {
                        //             console.error('Failed to initialize Matrix client');
                        //             return;
                        //         }
                        
                        //         // Fetch the list of joined rooms
                        //         const joinedRooms = client.getRooms().filter(room => room.getMyMembership() === 'join');
                                
                        //         // Iterate and print room names
                        //         joinedRooms.forEach(room => {
                        //             console.log(`Room ID: ${room.roomId}, Room Name: ${room.name}`);
                        //         });
                        //     } catch (error) {
                        //         console.error('Failed to fetch joined rooms:', error);
                        //     }
                        // };
                        
                        // Run the function to fetch joined rooms
                        // fetchJoinedRooms();
                        
                    } catch (error) {
                        console.error('Error in selectRoom handler:', error);
                    }
                }

                // Add this to handle session restoration failure
                window.addEventListener('error', function(event) {
                    if (event.message.includes('Unable to restore session')) {
                    window.parent.postMessage({ type: 'sessionRestorationFailed' }, '*');
                    }
                });
            });

            window.parent.postMessage({ type: 'ready' }, '*');
            return;
        }
        
        // Finally, load the app. All of the other react-sdk imports are in this file which causes the skinner to
        // run on the components.
        await loadApp(fragparts.params);
    } catch (err) {
        logger.error(err);
        // Like the compatibility page, AWOOOOOGA at the user
        // This uses the default brand since the app config is unavailable.
        await showError(_t("error|misconfigured"), [
            extractErrorMessageFromError(err, _t("error|app_launch_unexpected_error")),
        ]);
    }
}

start().catch((err) => {
    logger.error(err);
    // show the static error in an iframe to not lose any context / console data
    // with some basic styling to make the iframe full page
    document.body.style.removeProperty("height");
    const iframe = document.createElement("iframe");
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - typescript seems to only like the IE syntax for iframe sandboxing
    iframe["sandbox"] = "";
    iframe.src = supportedBrowser ? "static/unable-to-load.html" : "static/incompatible-browser.html";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.position = "absolute";
    iframe.style.top = "0";
    iframe.style.left = "0";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.border = "0";
    document.getElementById("matrixchat")?.appendChild(iframe);
});
