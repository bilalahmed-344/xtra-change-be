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



# Use Node.js 20 Alpine for smaller image size
FROM node:20-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nestjs -u 1001

# Copy package files
COPY --chown=nestjs:nodejs package.json ./
COPY --chown=nestjs:nodejs yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile --production=false

# Copy prisma schema first for better caching
COPY --chown=nestjs:nodejs prisma ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY --chown=nestjs:nodejs . .

# Build the application
RUN yarn build

# Remove dev dependencies to reduce image size
RUN yarn install --frozen-lockfile --production=true && yarn cache clean

# Switch to non-root user
USER nestjs

# Expose port
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]