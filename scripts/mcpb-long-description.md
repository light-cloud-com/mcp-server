Light Cloud runs your web apps, APIs and databases. This extension gives Claude the whole path from no account to a running app on a paid plan, without the web console:

- **Sign up or sign in** with an email: Claude shows a short code, you approve it at console.light-cloud.com/device from any device (a phone works). A new address gets an account on the Free plan: $1 of usage a month, unlimited static sites, 3 server apps, no card. No password, ever.
- **Deploy** a local folder or a GitHub repository; framework detection, `.env` parsing, a live URL and a console link on every deploy.
- **Databases and environment variables**: create a database on the shared pool, set its connection string, scale to always-on, attach a custom domain.
- **Plans and payment**: see the plan and how much of its included usage is used, and upgrade in one step, monthly or annual: Claude hands you a Stripe Checkout link that takes the card and the first payment together, and waits until the plan has switched. Card numbers never pass through the extension.
- **Logs, deployments, rollbacks** for everything you run.

Refusals come back with the next step, so Claude keeps going instead of stopping. Credentials stay on your machine in `~/.lightcloud/credentials.json`; the tools act as your signed-in user and nothing more.
