const { Sequelize, DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

// Setup SQLite with Sequelize
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: 'database.sqlite'
  });

// Define User Model
const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: uuidv4,
      primaryKey: true
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false
    }
  });
  
  // Define Token Model
  const Token = sequelize.define('Token', {
    token: {
      type: DataTypes.STRING,
      allowNull: false
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: 'id'
      }
    }
  });
  
  const Conversations = sequelize.define('Conversations', {
    id: {
      type: DataTypes.UUID,
      defaultValue: uuidv4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: 'id'
      }
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    memory: {
      type: DataTypes.BOOLEAN,
      allowNull: false
    }
  });
  
  
  const Messages = sequelize.define('Messages', {
    id: {
      type: DataTypes.UUID,
      defaultValue: uuidv4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: User,
        key: 'id'
      }
    },
    convId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: Conversations,
          key: 'id'
        }
      },
    type: {
      type: DataTypes.STRING,
      allowNull: false
    },
    json: {
      type: DataTypes.STRING,
      allowNull: false
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW // This will set the default value to the current date and time
    }
  });

  // Define the association
  Conversations.hasMany(Messages, {
    foreignKey: 'convId',
    onDelete: 'CASCADE',
    hooks: true // Ensures that hooks are called for cascade operations
    });

  // Define the inverse association (optional but recommended)
Messages.belongsTo(Conversations, {
  foreignKey: 'convId'
  });

  const db = {
    sequelize,
    User,
    Conversations,
    Messages,
    Token
  };
  
  module.exports = db;