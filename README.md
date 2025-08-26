# HOA Backend

A modern backend application for Homeowners Association (HOA) management built with NestJS, PostgreSQL, and Prisma.

## 🚀 Features

- **Modern Architecture**: Built with NestJS framework
- **Type Safety**: Full TypeScript support with Prisma ORM
- **Database**: PostgreSQL with automated migrations
- **API Documentation**: RESTful API endpoints
- **Development Tools**: Hot reload, linting, and testing setup
- **Production Ready**: Optimized build and deployment configuration

## 🛠️ Tech Stack

- **Framework**: [NestJS](https://nestjs.com/)
- **Database**: [PostgreSQL](https://www.postgresql.org/)
- **ORM**: [Prisma](https://www.prisma.io/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Package Manager**: npm

## 📋 Prerequisites

Before running this project, make sure you have:

- Node.js (v16 or higher)
- npm or yarn
- PostgreSQL database
- Git

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone git@github.com-company:Techify2-0/hoa-be.git
cd hoa-be
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Update the `.env` file with your configuration:

```env
# Database Configuration
DATABASE_URL="postgresql://username:password@localhost:5432/hoa_db?schema=public"

# Application Configuration
PORT=3000
NODE_ENV=development

# Add other environment variables as needed
```

### 4. Database Setup

```bash
# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev --name init

# (Optional) Seed the database
npm run seed
```

### 5. Start the Application

```bash
# Development mode with hot reload
npm run start:dev

# Production mode
npm run start:prod
```

The application will be running at `http://localhost:3000`

## 🛠️ Development

### Available Scripts

```bash
# Development
npm run start:dev      # Start with hot reload
npm run start:debug    # Start in debug mode

# Building
npm run build          # Build for production
npm run start:prod     # Start production build

# Code Quality
npm run lint           # Run ESLint
npm run format         # Format code with Prettier

# Testing
npm run test           # Run unit tests
npm run test:watch     # Run tests in watch mode
npm run test:cov       # Run tests with coverage
npm run test:e2e       # Run end-to-end tests

# Database
npm run prisma:generate # Generate Prisma client
npm run prisma:migrate  # Run migrations
npm run prisma:studio   # Open Prisma Studio
npm run prisma:reset    # Reset database
```

### Database Management

```bash
# Generate Prisma client after schema changes
npx prisma generate

# Create and apply a new migration
npx prisma migrate dev --name your_migration_name

# View and edit data with Prisma Studio
npx prisma studio

# Reset database (⚠️ This will delete all data)
npx prisma migrate reset
```

### Adding New Modules

```bash
# Generate a new module
nest generate module module-name

# Generate a controller
nest generate controller module-name

# Generate a service
nest generate service module-name

# Generate a complete resource
nest generate resource resource-name
```

## 🧪 Testing

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:cov

# Run end-to-end tests
npm run test:e2e
```

## 🚀 Deployment

### Environment Variables for Production

Make sure to set these environment variables in your production environment:

```env
DATABASE_URL="your_production_database_url"
NODE_ENV="production"
PORT=3000
```

### Build for Production

```bash
# Build the application
npm run build

# Start production server
npm run start:prod
```

### Docker Deployment (Optional)

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

This project uses ESLint and Prettier for code formatting. Make sure to run:

```bash
npm run lint
npm run format
```

## 📚 Additional Resources

- [NestJS Documentation](https://docs.nestjs.com/)
- [Prisma Documentation](https://www.prisma.io/docs/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

## 🐛 Troubleshooting

### Common Issues

#### Database Connection Issues

- Verify your `DATABASE_URL` in `.env`
- Make sure PostgreSQL is running
- Check if the database exists

#### Migration Issues

```bash
# Reset migrations if needed
npx prisma migrate reset

# Generate fresh migration
npx prisma migrate dev --name fresh_start
```

#### Dependencies Issues

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👥 Team

- **Development Team**: Techify 2.0

## 📞 Support

If you have any questions or need help, please:

1. Check the [Issues](https://github.com/Techify2-0/hoa-be/issues) page
2. Create a new issue if your problem isn't already reported
3. Contact the development team

---

**Happy Coding! 🎉**
# xtra-change-be
# xtra-change-be
# xtra-change-be
