/* eslint-disable max-lines */
import ComApi from 'eyeson/src/ComApi';
import Logger from 'eyeson/src/Logger';
import throttle from 'eyeson/src/utils/throttle';
import EventHandler from 'eyeson/src/EventHandler';
import ConferenceSession from 'eyeson/src/ConferenceSession';
import ConnectionMonitor from 'eyeson/src/ConnectionMonitor';
import ActionCableConnection from 'eyeson/src/ActionCableConnection';

class EyesonFactory {
    constructor() {

        /**
         * eyeson lib core.
         **/
        this.core = { eventHandler: new EventHandler() };

        /**
         * Initial connection status change updater.
         **/
        this.updateStatus = status =>
            this.core.eventHandler.send({ type: 'connection', connectionStatus: status });

        this.keepRoomAlive = () => {
            this.core.keepRoomAlive = setInterval(() => {
                this.core.rtConnection.send({ message: 'user_joins' });
            }, 30000);
        };

        /**
         * Remove this once WSS messages arrive reliably.
         **/
        this.pollingFallback = () => {
            let counter = 1;
            this.core.pollingFallbackInterval = setInterval(() => {
                if (counter === 200) {
                    Logger.debug(
                        'eyeson::pollingFallback: max count exceeded, clearing interval.'
                    );
                    clearInterval(this.core.pollingFallbackInterval);
                    return;
                }

                if (this.core.eventHandler._connection) {
                    Logger.debug(
                        'eyeson::pollingFallback: connection set, clearing interval.'
                    );
                    clearInterval(this.core.pollingFallbackInterval);
                    return;
                }

                this.core.comApi.getRoom(data => {
                    if (data.ready === true) {
                        Logger.debug('eyeson::pollingFallback: room ready');
                        this.core.eventHandler.send({ type: 'room_ready', content: data });
                        return;
                    }
                    Logger.debug('eyeson::pollingFallback: room not ready', counter);
                    counter += 1;
                });
            }, 5000);
        };

        /**
         * Load initial room data.
         **/
        this.loadInitialInfos = data => {
            if (data.broadcasts) {
                this.core.eventHandler.send({
                    type: 'broadcasts_update',
                    broadcasts: data.broadcasts
                });
            }
        };

        /****** The following represents the public API, adapt with caution! *********/
        this.config = {
            api: 'https://api.eyeson.team',
            youtube: { key: '', client: '' }
        }

        /****** Public data ********************************************************/

        /**
         * The room, user and links to be updated when fetched from the ComAPI.
         **/
        this.room = {}
        this.user = {}
        this.links = {}
    }

    /**
     * Join a session and listen to any events. eventHandler keeps all the
     * stuff.
     **/
    joinSession(mediaOptions) {
        if (!this.core.eventHandler._connection) {
            Logger.error(
                'You tried to join a session that is not yet available. ' +
                'Before calling join, a connection status of connected has ' +
                'to be received.'
            );
            return;
        }

        const session = new ConferenceSession(
            this.core.eventHandler._connection,
            mediaOptions
        );
        session.setMonitor(this.core.eventHandler.monitor);
        this.core.eventHandler.session = session;

        session.start();
        this.loadInitialInfos(this.core.eventHandler._rtData);
        clearInterval(this.core.keepRoomAlive);
        this.session = session; // eslint-disable-line no-invalid-this
    }

    /**
     * Initialise our connections.
     **/
    /* eslint-disable max-statements */
    prepareConnection(eyeson) {
        this.updateStatus('fetch_room');

        this.core.eventHandler.eyeson = eyeson;

        this.core.comApi.onError = () =>
            this.core.eventHandler.send({ type: 'warning', name: 'error:comapi' });

        this.core.comApi.getRoom(data => {
            if (data.error) {
                Logger.warn('eyeson::prepareConnection', data.error);
                this.updateStatus('access_denied');
                return;
            }
            this.updateStatus('received_room');

            this.core.rtConnection = new ActionCableConnection(data.links.websocket);
            this.core.eventHandler.rtConnection = this.core.rtConnection;
            this.core.rtConnection.startSession();

            this.core.eventHandler.monitor = new ConnectionMonitor();
            this.core.eventHandler.api = this.core.comApi;
            this.keepRoomAlive();
            this.pollingFallback();
        });
    }
    /* eslint-enable max-statements */

    /****** Public helper methods **********************************************/

    /**
     * Attach event listener
     **/
    onEvent(listener) {
        if (typeof listener !== 'function') {
            Logger.error(
                'A listener to eyeson events has to be of type function.' +
                ' The argument passed to onEvent is of type ' +
                typeof listener +
                '.'
            );
            return;
        }
        this.core.eventHandler.onReceive(listener);
    }

    /**
     * Remove event listener
     **/
    offEvent(listener) {
        this.core.eventHandler.removeListener(listener);
    }

    /**
     * Prepare required core connections.
     **/
    connect(token) {
        Logger.debug('eyeson::connect', token);
        this.core.comApi = new ComApi(this.config.api, token);
        this.prepareConnection(this);
    }

    /**
     * Join a session with supplied mediaOptions (audio/video).
     **/
    join(mediaOptions) {
        Logger.debug('eyeson::join', mediaOptions);
        this.joinSession(mediaOptions);
    }

    /**
     * Start an eyeson room meeting.
     **/
    start(token, mediaOptions = { audio: true, video: true }) {
        Logger.debug('eyeson::start');
        const joinOnConnect = event => {
            if (event.connectionStatus !== 'ready') {
                return;
            }
            this.offEvent(joinOnConnect);
            this.join(mediaOptions);
        };
        this.onEvent(joinOnConnect);
        this.connect(token);
    }

    /**
     * Destroy and cleanup a session.
     **/
    destroy() {
        Logger.debug('eyeson::destroy');
        clearInterval(this.core.keepRoomAlive);
        this.core.eventHandler.destroy();
        this.core.eventHandler = new EventHandler();
    }

    /**
     * Receive an event from client.
     **/
    send(msg) {
        msg._src = 'client';
        return this.core.eventHandler.send(msg);
    }

    /**
     * When invoked repeatedly, will only actually call the original function at
     * most once per every wait milliseconds.
     **/
    throttledSend(msg) {
        if (!this._throttledSend) {
            this._throttledSend = throttle(message => this.send(message), 500);
        }

        return this._throttledSend(msg);
    }
}

export default EyesonFactory;
/* eslint-enable max-lines */