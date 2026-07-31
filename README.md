# Lost & Found - Backend (Express + TypeScript + MongoDB)

A single-file, monolithic backend for the Lost & Found project.
Everything — models, services, controllers, middleware, and routes — lives
inside **one file**: `api/index.ts`, clearly separated by section comments.
This is built to deploy directly on **Vercel** as a serverless function.

## Tech Used
- Express.js
- TypeScript
- MongoDB + Mongoose
- JWT (jsonwebtoken) for auth
- bcryptjs for password hashing

## Project Structure
```
lost-and-found-backend/
├── api/
│   └── index.ts        <- everything: DB, models, services, controllers, routes
├── package.json
├── tsconfig.json
├── vercel.json          <- tells Vercel how to run this as a serverless function
├── .env.example
```

## API Endpoints

| Method | Route                       | Auth required | Description             |
|--------|------------------------------|---------------|--------------------------|
| GET    | /api/health                  | No            | Health check            |
| POST   | /api/auth/signup              | No            | Register a new user      |
| POST   | /api/auth/login                | No            | Login, returns JWT token |
| GET    | /api/posts                    | No            | Get all posts            |
| POST   | /api/posts                    | Yes (Bearer)  | Create a new post         |
| POST   | /api/posts/:id/like            | Yes (Bearer)  | Like / unlike a post     |
| POST   | /api/posts/:id/comments        | Yes (Bearer)  | Add a comment to a post   |

**Auth header format:** `Authorization: Bearer <token>`

### Example bodies

Signup:
```json
{ "name": "Rakib Hasan", "email": "rakib@example.com", "password": "12345" }
```

Login:
```json
{ "email": "rakib@example.com", "password": "12345" }
```

Create post:
```json
{ "type": "Lost", "title": "Lost wallet", "description": "Near library", "location": "Library" }
```

Add comment:
```json
{ "text": "I found something similar!" }
```

## 1. Run Locally

### Install Node.js
Make sure Node.js v18+ is installed.

### Get a MongoDB connection string
Easiest option: create a free cluster at https://www.mongodb.com/cloud/atlas
Then get your connection string (looks like `mongodb+srv://user:pass@cluster.mongodb.net/dbname`).

### Setup
```bash
cd lost-and-found-backend
npm install
cp .env.example .env
```

Edit `.env` and paste your MongoDB URI and any JWT secret:
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/lostandfound
JWT_SECRET=any_random_secret_string
```

### Run in dev mode
```bash
npm run dev
```

Server runs at: `http://localhost:5000`

Test it: `http://localhost:5000/api/health`

## 2. Deploy to Vercel

### Option A: Using Vercel CLI
```bash
npm i -g vercel
cd lost-and-found-backend
vercel
```
Follow the prompts (link/create a project). Then add environment variables:
```bash
vercel env add MONGODB_URI
vercel env add JWT_SECRET
```
Then deploy to production:
```bash
vercel --prod
```

### Option B: Using Vercel Dashboard (no CLI)
1. Push this folder to a GitHub repository.
2. Go to https://vercel.com/new and import that repository.
3. Vercel will detect `vercel.json` automatically.
4. Before deploying, go to **Project Settings → Environment Variables** and add:
   - `MONGODB_URI` = your MongoDB connection string
   - `JWT_SECRET` = any random secret string
5. Click **Deploy**.

Once deployed, your API will be live at something like:
```
https://your-project-name.vercel.app/api/health
```

## 3. Connect Your React Frontend

In your React app, set the base URL to your deployed Vercel URL, e.g.:
```js
const API_URL = "https://your-project-name.vercel.app/api";

fetch(`${API_URL}/posts`)
  .then(res => res.json())
  .then(data => console.log(data));
```

For login/signup, save the returned `token` (e.g. in memory or localStorage) and
send it as `Authorization: Bearer <token>` on protected requests (create post,
like, comment).

## Notes
- MongoDB connection is cached between requests so it works efficiently in
  Vercel's serverless environment (no reconnect on every request).
- Passwords are hashed with bcrypt before saving — never stored in plain text.
- This is a simple, single-file backend meant for a college project — for a
  larger real-world app you'd normally split this into separate folders
  (models/, controllers/, services/, routes/), but everything works the same way.
