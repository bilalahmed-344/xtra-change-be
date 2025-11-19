# # Use official Node.js LTS image as the base
# # FROM node:18-alpine
# FROM node:18-alpine


# # Set working directory
# WORKDIR /app

# # Copy package.json and package-lock.json
# COPY package*.json ./

# # Install dependencies
# RUN npm install 

# # Copy the rest of the application code
# COPY . .

# RUN npx prisma generate

# # Build the NestJS project
# RUN npm run build


# # Expose the port your app runs on
# EXPOSE 3000

# # Start the application
# CMD ["npm", "run","start:dev"]
# # CMD ["npm", "run", "start:prod"]

FROM node:20
WORKDIR /app
COPY package*.json ./
RUN RUN npm install 
COPY . .
RUN npx prisma generate
ENV NODE_ENV=development
RUN npm run build
EXPOSE 3000
ENTRYPOINT ["/bin/sh", "-c", "npm run prisma:migrate && npm run start:prod"]
# HEALTHCHECK --interval=30s --timeout=3s \
#   CMD curl -f http://localhost:3000/api/up || exit 1


