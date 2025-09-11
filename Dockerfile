# Use official Node.js LTS image as the base
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./



# Copy the rest of the application code
COPY . .

# Install dependencies
RUN npm install 


# Expose the port your app runs on
EXPOSE 3000

# Start the application
CMD ["npm", "run","start:dev"]