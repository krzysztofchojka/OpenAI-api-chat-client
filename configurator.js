const prompt = require('prompt');
const fs = require('fs');

function runConfigurator() {
  const schema = {
    properties: {
      SERVER_PORT: {
        description: 'Enter the server port',
        type: 'number',
        default: 3005,
        required: true
      },
      SERVER_HOSTNAME: {
        description: 'Enter the server hostname',
        type: 'string',
        default: 'https://gpt.shibatalks.com',
        required: true
      },
      SECRET_KEY: {
        description: 'Enter the secret key',
        type: 'string',
        hidden: true,
        required: true
      },
      OPENAI_API_KEY: {
        description: 'Enter the OpenAI API key',
        type: 'string',
        hidden: true,
        required: true
      },
      INVITE_CODES: {
        description: 'Enter invite codes separated by commas',
        type: 'string',
        required: true
      }
    }
  };

  prompt.start();

  prompt.get(schema, (err, result) => {
    if (err) {
      console.error('Error getting input:', err);
      return;
    }

    const inviteCodes = result.INVITE_CODES.split(',').map(code => code.trim());

    const config = {
      SERVER_PORT: result.SERVER_PORT,
      SERVER_HOSTNAME: result.SERVER_HOSTNAME,
      SECRET_KEY: result.SECRET_KEY,
      OPENAI_API_KEY: result.OPENAI_API_KEY,
      INVITE_CODES: inviteCodes
    };

    fs.writeFileSync('config.json', JSON.stringify(config, null, 2));
    console.log('Configuration saved to config.json');

    // Exit the process after creating config.json
    process.exit(0);
  });
}

module.exports = runConfigurator;
