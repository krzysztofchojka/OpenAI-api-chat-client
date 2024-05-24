const fs = require('fs');
const jwt = require('jsonwebtoken');
const { Token } = require('./models'); // Import models
const CONFIG = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const SECRET_KEY = CONFIG.SECRET_KEY
const wsClientManager = require('./wsClientManager');

// ======== Websockets =========
module.exports = function(wss) {
    wss.on('connection', ws => {
        console.log('New client connected');

        ws.on('message', async message => {
            try {
                const parsedMessage = JSON.parse(message);
                if (parsedMessage.action === 'auth') {
                    const token = parsedMessage.token;
                    // Verify the token and associate it with the user
                    // Assuming a function verifyToken exists
                    const userId = await verifyToken(token);
                    if (userId) {
                        ws.userId = userId;
                        wsClientManager.addClient(ws)
                        ws.send('{"message":"Authentication successful"}');
                    } else {
                        ws.send('{"error":"Authentication failed"}');
                        ws.close();
                    }
                } else {
                    console.log('Received:', message);
                    // Echo the received message back to the client
                    ws.send(`Server received: ${message}`);
                }
            } catch (error) {
                console.error('Error while processing message:', error);
                ws.send(`Error while parsing JSON, server received: ${message}`);
            }
        });

        ws.on('close', () => {
            console.log('Client disconnected');
            wsClientManager.removeClient(ws);
        });

        ws.on('error', error => {
            console.error('WebSocket error:', error);
        });
    });
};

const verifyToken = async (token) => {
    const accessToken = token.split(' ')[1];
    if (!accessToken) {
      return null
    }
    try {
      const decoded = jwt.verify(accessToken, SECRET_KEY);
      const tokenRecord = await Token.findOne({ where: { token: accessToken, userId: decoded.id } });
      if (!tokenRecord) {
        return null
      }
      //let username = await User.findByPk(decoded.id);
      let userId = decoded.id;
      return userId;

    } catch (error) {
        console.error(error)
      return null
    }
  };