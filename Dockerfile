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




# new one

# Build stage
# FROM node:18-alpine AS builder
# WORKDIR /app

# COPY package*.json ./
# RUN npm ci   # better than npm install for reproducible builds

# COPY . .
# RUN npx prisma generate
# RUN npm run build

# # Production stage
# FROM node:18-alpine AS production
# WORKDIR /app

# # Copy only necessary files from builder
# COPY --from=builder /app/dist ./dist
# COPY --from=builder /app/node_modules ./node_modules
# COPY --from=builder /app/package*.json ./
# COPY --from=builder /app/prisma ./prisma

# # Generate Prisma client again (in case base image differs)
# RUN npx prisma generate

# EXPOSE 3000

# # Run migrations and then start the app (recommended)
# CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:prod"]



# 1. Fix the Dockerfile (restore the correct one)
cat > Dockerfile << 'EOF'
# Build stage
FROM node:18-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

# Production stage
FROM node:18-alpine AS production
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

RUN npx prisma generate

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:prod"]
EOF