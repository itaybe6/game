# GitHub Webhook via ngrok (for local Jenkins)

This setup is for development only.

## Recommended: ngrok via Docker Compose (no Windows install)

Use this if you see `ngrok : The term 'ngrok' is not recognized` in PowerShell — the `ngrok` CLI is not installed or not on your `PATH`.

1. Get an authtoken from your [ngrok dashboard](https://dashboard.ngrok.com/get-started/your-authtoken) and add it to `.env`:
   - `NGROK_AUTHTOKEN=...`
2. Start the stack **with** the `dev` profile so the `ngrok` service runs:
   - `docker compose --profile dev up -d`
3. Open the local ngrok inspector and copy the public **HTTPS** URL:
   - [http://localhost:4040](http://localhost:4040)
4. In GitHub: `Settings → Webhooks → Add webhook`
   - `Payload URL`: `https://<your-ngrok-host>/github-webhook/` (trailing slash)
   - `Content type`: `application/json`
   - `Events`: `Just the push event`

If Jenkins is already running and you only need to add ngrok:

- `docker compose --profile dev up -d ngrok`

## Option: Run ngrok locally on the host

1. Download and install ngrok: [https://ngrok.com/download](https://ngrok.com/download), and ensure the folder containing `ngrok.exe` is on your `PATH` (or run it with the full path).
2. Start your stack (Jenkins on port 8081):
   - `docker compose up -d`
3. Run ngrok **in a second terminal** (not on the same line as `docker compose`):
   - `ngrok http 8081`
4. Copy the HTTPS URL from ngrok (for example: `https://abc123.ngrok-free.app`)
5. In GitHub repository:
   - `Settings -> Webhooks -> Add webhook`
   - `Payload URL`: `https://<your-ngrok-host>/github-webhook/` (with trailing slash)
   - `Content type`: `application/json`
   - `Events`: `Just the push event`

## Important notes

- ngrok URL changes between runs unless you use a reserved domain/paid setup.
- Keep ngrok running while expecting webhook deliveries.
- This approach is not for production.
