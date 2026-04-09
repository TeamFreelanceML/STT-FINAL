FROM node:20-alpine

WORKDIR /app

ARG NEXT_PUBLIC_EVALUATION_API_BASE_URL=http://localhost:8000
ARG NEXT_PUBLIC_TTS_WORD_API_URL=http://host.docker.internal:8001/narrate/word

ENV NEXT_PUBLIC_EVALUATION_API_BASE_URL=$NEXT_PUBLIC_EVALUATION_API_BASE_URL
ENV NEXT_PUBLIC_TTS_WORD_API_URL=$NEXT_PUBLIC_TTS_WORD_API_URL

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
