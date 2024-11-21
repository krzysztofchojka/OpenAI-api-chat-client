const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Sequelize, DataTypes } = require('sequelize');
const axios = require('axios');
const { sequelize, Conversations, Token, Messages, User } = require('./models'); // Import models
const path = require('path');
const WebSocket = require('ws');
const wsClientManager = require('./wsClientManager');
const fs = require('fs');
const CONFIG = JSON.parse(fs.readFileSync('config.json', 'utf8'));

router.use(express.json());
router.use(bodyParser.json());

const SECRET_KEY = CONFIG.SECRET_KEY
const OPENAI_API_KEY = CONFIG.OPENAI_API_KEY
const INVITE_CODES = CONFIG.INVITE_CODES

// Initialize Database
sequelize.sync().then(() => {
  console.log('Database & tables created!');
});

// Middleware function to check for access token
const checkAccessToken = async (req, res, next) => {
  const accessToken = req.headers['authorization'].split(' ')[1];
  if (!accessToken) {
    return res.status(401).json({ error: 'Access token is missing' });
  }
  try {
    const decoded = jwt.verify(accessToken, SECRET_KEY);
    const tokenRecord = await Token.findOne({ where: { token: accessToken, userId: decoded.id } });
    if (!tokenRecord) {
      return res.status(401).json({ error: 'Invalid access token' });
    }
    req.user = await User.findByPk(decoded.id);
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid access token' });
  }
};

router.get('/check-token', checkAccessToken, async (req, res) => {
  res.status(200).json({ message: 'Access token is valid' });
});

router.post('/conv/create', async (req, res) => {
  try {
    const accessToken = req.headers['authorization'].split(' ')[1]; // Assuming the token is passed as a Bearer token
    const tokenRecord = await Token.findOne({ where: { token: accessToken } });

    if (!tokenRecord) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = tokenRecord.userId;
    const { title, memory } = req.body;

    const newConversation = await Conversations.create({
      userId,
      title,
      memory
    });

    let ws_clients = wsClientManager.getClients();
    ws_clients.forEach(client => {
        if (client.readyState == WebSocket.OPEN && client.userId == userId) {
            client.send(`{"action":"new_conversation", "convId":"${newConversation.id}"}`)
        }
    });

    res.status(201).json({ convId: newConversation.id });

  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.delete('/conv/delete/:id', async (req, res) => {
  try {
    const accessToken = req.headers['authorization'].split(' ')[1]; // Assuming the token is passed as a Bearer token
    const tokenRecord = await Token.findOne({ where: { token: accessToken } });

    if (!tokenRecord) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = tokenRecord.userId;
    const conversationId = req.params.id;

    const conversation = await Conversations.findOne({ where: { id: conversationId } });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conversation.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden: You do not own this conversation' });
    }

    await Conversations.destroy({ where: { id: conversationId } });

    let ws_clients = wsClientManager.getClients();
    ws_clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN && client.userId === userId) {
        client.send(`{"action":"delete_conversation", "convId":"${conversationId}"}`);
      }
    });

    res.status(200).json({ message: 'Conversation deleted successfully' });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/conv/list', async (req, res) => {
  try {
    const accessToken = req.headers['authorization'].split(' ')[1];
    const tokenRecord = await Token.findOne({ where: { token: accessToken } });
    if (!tokenRecord) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = tokenRecord.userId;
    const conversationsList = await Conversations.findAll({ where: { userId:userId} })
    res.status(201).json({ convList: conversationsList });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/conv/load/:id', async (req, res) => {
  try {
    const accessToken = req.headers['authorization'].split(' ')[1];
    const tokenRecord = await Token.findOne({ where: { token: accessToken } });
    if (!tokenRecord) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    //check if user is owner of the conv, tbd...
    const userId = tokenRecord.userId;

    const conversationId = req.params.id;
    const messagesList = await Messages.findAll({ where: { convId:conversationId} })
    res.status(201).json({ messagesList: messagesList });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/message/send', async (req, res) => {
  try {
    const accessToken = req.headers['authorization'].split(' ')[1]; // Assuming the token is passed as a Bearer token
    const tokenRecord = await Token.findOne({ where: { token: accessToken } });

    if (!tokenRecord) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = tokenRecord.userId;
    const { convId, userMessage, model, image } = req.body;
    let json;
//If user wants a math equasion use LaTex and start with backslash bracket.
    let messages = [{ role: 'system', content: 'You are a helpful assistant. If user asks you to draw something start your reply EXACTLY like this: ![generate_image]and here write the image prompt for DALLE' }];
    if (image) {
      json = [
        { role: 'user', content: userMessage },
        { role: 'user', content: [
          { type: "text", text: userMessage },
          {
            type: "image_url",
            image_url: {
              "url": image,
            }
          }
        ]}
      ]
      messages.push(json[0], json[1]);
    } else {
      json = [{ role: 'user', content: userMessage }]
      messages.push(json[0]);
    }
    for(let m of json){
      const newMessage = await Messages.create({
        userId,
        convId,
        type: "text",
        json:JSON.stringify(m)
      });
    }

    let ws_clients = wsClientManager.getClients();
    ws_clients.forEach(client => {
        if (client.readyState == WebSocket.OPEN && client.userId == userId) {
            for(let m of json){
              client.send(JSON.stringify({
                action:"new_message",
                convId:convId,
                author:userId,
                content:m.content
              }))
            }
        }
    });

    // sebnd request to openai api
    try {
      let GPTModel = "gpt-3.5-turbo";
      if (model == "gpt-4o") {
        GPTModel = "gpt-4o";
      }else
      if (model == "o1-mini") {
        GPTModel = "o1-mini";
      }
      const response = await axios.post('https://api.openai.com/v1/chat/completions',
        {
          model: GPTModel,
          messages: messages,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
          },
        }
      );

      // this handles only text, add img support
      //ws_clients = wsClientManager.getClients();
      const answer = response.data.choices[0].message;
      if(!answer.content.startsWith("![generate_image]")){
          await Messages.create({
            userId:null,
            convId,
            type: "text",
            json:JSON.stringify(answer)
          });
          ws_clients.forEach(client => {
            if (client.readyState == WebSocket.OPEN && client.userId == userId) {
              client.send(JSON.stringify({
                action:"new_message",
                convId:convId,
                author:"GPT",
                content:answer.content
              }))
                  //client.send(`{"action":"new_message", "convId":"${convId}", "author":"GPT", "content":"${answer.content}"}`)
            }
        });
      }else{
            try {
              const prompt = answer.content.replace("![generate_image]", "");
      
              // Step 1: Request to generate image
              const generateImageResponse = await axios.post(`http://localhost:${String(CONFIG.SERVER_PORT)}/api/generate-image`, { prompt:prompt }, {
                  headers: {
                      'Authorization': `Bearer ${accessToken}`,
                      'Content-Type': 'application/json'
                  }
              });
      
              const imageUrl = generateImageResponse.data.imageUrl;
      
              // Step 2: Download the image
              const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
              const timestamp = Date.now();
              const imageName = `image_${timestamp}.png`;
              const imagePath = path.join(__dirname, 'uploads', imageName);
              const relativePath = `{CONFIG.SERVER_HOSTNAME}/uploads/${imageName}`;
      
              // Save the image to the uploads directory
              fs.writeFileSync(imagePath, imageResponse.data);

              await Messages.create({
                userId:null,
                convId,
                type: "image_url",
                json:JSON.stringify(
                  { role: 'user', content: [
                  {
                    type: "image_url",
                    image_url: {
                      "url": relativePath,
                    }
                  }
                ]})
              });
              ws_clients = wsClientManager.getClients()
              ws_clients.forEach(client => {
                if (client.readyState == WebSocket.OPEN && client.userId == userId) {
                      client.send(`{"action":"new_message_img", "convId":"${convId}", "author":"GPT", "content":"${relativePath}"}`)
                }
            });
      
              res.status(200).json({ message: 'Image saved successfully', imagePath });
      
          } catch (error) {
              console.error('Error processing request:', error);
              res.status(500).json({ error: 'Internal Server Error' });
          }
      }

    } catch (error) {
      console.error('Error processing request:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }

    //res.status(201).json({});

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/me', checkAccessToken, async (req, res) => {
  try {
    const accessToken = req.headers['authorization'].split(' ')[1];
    const decoded = jwt.verify(accessToken, SECRET_KEY);
    const tokenRecord = await Token.findOne({ where: { token: accessToken, userId: decoded.id } });
    if (!tokenRecord) {
      return res.status(401).json({ error: 'Invalid access token' });
    }
    const user = await User.findByPk(decoded.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ username: user.username, userid:user.id});
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/hello', async (req, res) => {
  res.status(200).json({ message: 'Hello World!' });
});

router.post('/register', async (req, res) => {
  const { username, password, invitecode } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if(!invitecode){
    return res.status(400).json({ error: 'Invite code is required' });
  }
  if(!INVITE_CODES.includes(invitecode)){
    return res.status(400).json({ error: 'Invite code is invalid' });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ username, password: hashedPassword });
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  try {
    const user = await User.findOne({ where: { username } });
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const token = jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: '24h' });
    await Token.create({ token, userId: user.id });
    res.status(200).json({ token });
  } catch (error) {
    console.error('Error logging in user:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/logout', checkAccessToken, async (req, res) => {
  try {
    const accessToken = req.headers['authorization'].split(' ')[1];
    await Token.destroy({ where: { token: accessToken } });
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Error logging out user:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/ask', checkAccessToken, async (req, res) => {
  try {
    const { userMessage, model, image } = req.body;
    let GPTModel = "gpt-3.5-turbo";
    if (model == "gpt-4o") {
      GPTModel = "gpt-4o";
    }

    let messages = [{ role: 'system', content: 'You are a helpful assistant. If user asks you to draw something start your reply EXACTLY like this: ![generate_image]and here write the image prompt for DALLE' }];
    if (image) {
      messages.push(
        { role: 'user', content: userMessage },
        { role: 'user', content: [
          { type: "text", text: userMessage },
          {
            type: "image_url",
            image_url: {
              "url": image,
            }
          }
        ]}
      );
    } else {
      messages.push({ role: 'user', content: userMessage });
    }
    const response = await axios.post('https://api.openai.com/v1/chat/completions',
      {
        model: GPTModel,
        messages: messages,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
      }
    );

    const answer = response.data.choices[0].message.content;
    res.json({ answer });
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/generate-image', checkAccessToken, async (req, res) => {
  try {
    const prompt = req.body.prompt;

    const response = await axios.post('https://api.openai.com/v1/images/generations', {
      prompt: prompt,
      model: "dall-e-3",
      n: 1,
      size: '1024x1024'
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    console.log(response.data)
    const imageUrl = response.data.data[0].url;
    res.json({ imageUrl: imageUrl });

  } catch (error) {
    console.error('Error generating image:', error);
    res.status(500).send('Error generating image');
  }
});

module.exports = router;
