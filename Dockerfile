# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy the rest of the application code to the working directory
COPY . .

# Copy the Prisma schema
COPY prisma ./prisma/

# Generate the Prisma client
RUN npx prisma generate

# Make port 3000 available to the world outside this container
EXPOSE 3000

# Define the command to run the app
CMD [ "npm", "start" ]
