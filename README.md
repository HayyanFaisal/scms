# SCMS

This project now runs with a React frontend and a local Express/MySQL backend.

## Run

1. Make sure MySQL is running and the `pnba` database exists.
2. Confirm the root `.env` file contains the connection string.
3. Run `npm install` once.
4. Start everything with `npm run dev`.

The launcher starts the API on [http://localhost:3001](http://localhost:3001) and the Vite app on [http://localhost:5173](http://localhost:5173).

## Data

The backend auto-migrates the existing tables to the fields the app expects, then the frontend hydrates its cache from the API.
Use the dashboard's sample-data button if you want to repopulate the SQL tables.
