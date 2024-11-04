const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    mongoose.connect(
      "mongodb+srv://admin-Jackson:jaydenjackson1@cluster0.bnu3c.mongodb.net/farm-managment?retryWrites=true&w=majority"
    );
    console.log("MongoDB connected!!");
  } catch (error) {
    console.log("Failed to connect to MongoDB", error);
  }
};

module.exports = connectDB;
