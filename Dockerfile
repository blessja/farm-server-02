# Use official Node.js image (change to your runtime as needed)
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy application code
COPY . .

# Expose port (Cloud Run uses PORT env variable)
EXPOSE 8080

# Start the server
CMD ["npm", "start"]