FROM node:14.19.1-alpine as npm
WORKDIR /app
COPY ./package.json ./package.json
COPY ./package-lock.json ./package-lock.json

FROM npm as builder
RUN npm ci
COPY ./src/ ./src/
COPY ./babel.config.json ./babel.config.json
COPY ./tsconfig.json ./tsconfig.json
COPY ./tsconfig.app.json ./tsconfig.app.json
RUN npm run build

FROM npm as runner
RUN npm ci --production
COPY ./assets/ ./assets/
COPY --from=builder /app/dist/ ./dist/

CMD [ "npm", "start" ]
