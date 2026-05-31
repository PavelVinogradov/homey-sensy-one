const EventEmitter = require("events");
const Net = require("net");
const { pb, id_to_type } = require("@2colors/esphome-native-api/lib/utils/messages");

class FrameHelper extends EventEmitter {
    constructor(host, port) {
        super();
        this.host = host;
        this.port = port;
        this.buffer = Buffer.from([]);
        this.socket = new Net.Socket();
        this.socket.on("close", () => {
            this.clearBuffer();
            this.emit("close");
        });
        this.socket.on("error", (e) => {
            this.emit("error", e);
            this.end();
        });
        this.socket.on("end", () => {
            this.clearBuffer();
        });
    }

    connect() {
        this.clearBuffer();
        this.socket.connect(this.port, this.host);
    }

    end() {
        this.socket.end();
        this.clearBuffer();
    }

    destroy() {
        this.socket.destroy();
    }

    removeAllListeners() {
        this.socket.removeAllListeners();
        super.removeAllListeners();
    }

    buildMessage(messageId, bytes) {
        if (id_to_type[messageId] === undefined) {
            // Unknown future message type — skip silently, keep connection alive
            return undefined;
        }
        try {
            return pb[id_to_type[messageId]].deserializeBinary(bytes);
        } catch(e) {
            this.emit('error', new Error(`Failed find or parsed message type for Id: ${messageId}`));
        }
    }

    clearBuffer() {
        this.buffer = Buffer.from([]); // clear buffer. ensure clean state for connection
    }
}

module.exports = FrameHelper;
