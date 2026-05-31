const FrameHelper = require('./frameHelper');
const { varuint_to_bytes, recv_varuint } = require("@2colors/esphome-native-api/lib/utils/index");

class PlaintextFrameHelper extends FrameHelper {
    constructor(host, port) {
        super(host, port);
        this.socket.on("data", (data) => this.onData(data));
        this.socket.on("connect", () => this.onConnect());
    }

    serialize(message) {
        const encoded = message.serializeBinary()
        return Buffer.from([
            0,
            ...varuint_to_bytes(encoded.length),
            ...varuint_to_bytes(message.constructor.id),
            ...encoded,
        ]);
    }

    deserialize(buffer) {
        if (buffer.length < 3) return null;

        let offset = 0;
        const next = () => {
            if (offset >= buffer.length)
                return null;
            return buffer[offset++];
        };
        const t = next();
        if (t !== 0) {
            if(t === 1) throw new Error('Bad format: Encryption expected');
            throw new Error(`Bad format. Expected 0 at the begin`);
        }

        const messageLength = recv_varuint(next);
        if (messageLength === null)
            return null;
        const messageId = recv_varuint(next);
        if (messageId === null)
            return null;
        if (messageLength + offset > buffer.length)
            return null;

        const message = this.buildMessage(messageId, buffer.subarray(offset, messageLength + offset));
        if (message === undefined) {
            // Unknown message type — consume bytes and continue without emitting
            const skip = Object.create(null);
            skip.__skip = true;
            skip.length = messageLength + offset;
            return skip;
        }
        message.length = messageLength + offset;
        return message;
    }

    onData(data) {
        this.emit("data", data);
        this.buffer = Buffer.concat([this.buffer, data]);
        let message;
        try {
            while ((message = this.deserialize(this.buffer))) {
                this.buffer = this.buffer.slice(message.length);
                if (!message.__skip) this.emit("message", message);
            }
        } catch (e) {
            this.emit("error", e);
            this.emit("unhandledData", data);
        }
    }

    onConnect() {
        this.emit("connect");
    }

    sendMessage(message) {
        this.socket.write(this.serialize(message));
    }
}

module.exports = PlaintextFrameHelper;
