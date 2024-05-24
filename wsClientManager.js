let ws_clients = [];

module.exports = {
    addClient: function(client) {
        ws_clients.push(client);
    },
    removeClient: function(client) {
        ws_clients = ws_clients.filter(c => c !== client);
    },
    getClients: function() {
        return ws_clients;
    }
};