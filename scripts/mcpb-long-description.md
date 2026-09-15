Light Cloud runs your web apps, APIs and databases. This extension gives Claude the whole path from no account to a running app on a paid plan, without the web console:

- **Sign up or sign in** with an email: Claude shows a short code, you approve it at console.light-cloud.com/device from any device (a phone works). A new address gets an account on the free plan. No password, ever.
- **Deploy** a local folder or a GitHub repository; framework detection, `.env` parsing, a live URL and a console link on every deploy.
- **Databases and environment variables**: create a database on the shared pool, set its connection string, scale to always-on, attach a custom domain.
- **Plans and payment**: see the plan and usage pool, switch plan, add a card through a Stripe-hosted link Claude waits on. Card numbers never pass through the extension.
- **Logs, deployments, rollbacks** for everything you run.

Refusals come back with the next step, so Claude keeps going instead of stopping. Credentials stay on your machine in `~/.lightcloud/credentials.json`; the tools act as your signed-in user and nothing more.
