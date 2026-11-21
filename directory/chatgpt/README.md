# Light Cloud plugin for the ChatGPT plugin directory

This is the submission package for [platform.openai.com/plugins](https://platform.openai.com/plugins). The process is in `platform/docs/mcp/LISTINGS.md` §3. The package follows OpenAI's Agent Plugins format, read on 2026-11-17 at [Upload and submit your plugin](https://developers.openai.com/plugins/deploy/submission) and [Package your plugin](https://developers.openai.com/plugins/build/plugins). Draft for Julia's approval: nothing is uploaded.

## Files

| File | What it is | In the ZIP |
| --- | --- | --- |
| `plugin.json` | The manifest. Package identity sits at the root; the listing text, links, icon, review cases and release notes sit under `extensions["com.openai"]`. | yes |
| `mcp.json` | The one remote MCP server, `https://mcp.light-cloud.com/chatgpt`: OAuth with CIMD preferred (DCR is the fallback), no headers, no secrets. | yes |
| `assets/logo.png` | The logo and composer icon, copied from `mcp-server/icon.png` (512×512 PNG). | yes |
| `light-cloud-chatgpt-plugin.zip` | The built package to upload. | — |
| `check.py` | Checks that both JSON files parse, every character limit, the icon, the single server, the 5 + 3 test cases (against `CHATGPT_TOOLS`), banned listing words, and that the ZIP is up to date. | no |
| `TEST_CASES.md` | The eight review cases in readable form, with the reviewer-account needs and the order to run them in. | no |
| `DEMO_SCRIPT.md` | The 60 to 90 second recording script. | no |

## Rebuild the ZIP

After any change to `plugin.json`, `mcp.json` or the logo:

```sh
cd platform/mcp-server/directory/chatgpt
python3 check.py && rm -f light-cloud-chatgpt-plugin.zip && zip -X light-cloud-chatgpt-plugin.zip plugin.json mcp.json assets/logo.png && python3 check.py
```

The second `check.py` confirms the ZIP holds exactly those three files and that they match. Bump `version` in `plugin.json` for every upload after the first.

## Before uploading

- The demo video address is not in the ZIP (removed 2026-11-17 so the upload need not wait for the video): type it in the portal under Review details.
- If the upload rejects `mcp.json` over the `extensions` key, delete the `extensions` object and rebuild. OpenAI's guide puts the OAuth settings there, but the published agent-plugins.org 1.0.0 schema has no such key. Without it, the portal finds OAuth through discovery (`/.well-known/oauth-protected-resource/chatgpt`).
- Check that **Developer Tools** is in the portal's category list. If it is not, set `category` to the closest title.

## Portal fields that are not in the ZIP

| Where | Field | Value |
| --- | --- | --- |
| Upload | Developer identity | The verified Light Cloud organisation (business verification, LISTINGS §3 step 1) |
| MCPs → Connect | MCP Server URL, Authentication | Read from `mcp.json`: `https://mcp.light-cloud.com/chatgpt`, OAuth |
| MCPs → Connect | OAuth Client Secret | None. It is a public client (`token_endpoint_auth_methods_supported: ["none"]`), so leave it empty if the field shows. |
| MCPs → Connect | Domain verification | The portal shows a token, to be served as plain text at `https://mcp.light-cloud.com/.well-known/openai-apps-challenge`. The route is live (mcp-server 1.7.0, `src/http.ts`) and answers 404 until the `OPENAI_APPS_CHALLENGE` env var holds the token; Claude sets it with `gcloud run services update mcp-server --update-env-vars OPENAI_APPS_CHALLENGE=<token> --region europe-west1 --project lc-console-production`. |
| MCPs → Connect | Account used to connect and scan | The reviewer account |
| Review details | Login URL | `https://console.light-cloud.com` |
| Review details | Email | `directory-review@light-cloud.com` |
| Review details | Password | in `~/.config/light-cloud/directory-reviewer-password` (Julia's Mac) |
| Review details | Workspace or tenant | `Light Cloud review` |
| Review details | Sign-in instructions | See the draft below |
| Review details | Demo video | Only if `demo_recording_url` was removed from the ZIP |
| Publication | Countries | Not in the ZIP. Omitting it keeps the portal's targeting. Decide after checking whether directory plugins reach ChatGPT users in the EU and UK (LISTINGS §3). |
| Submit for review | Policy attestations | Julia |

Draft sign-in instructions. Check them against the real sign-in page before pasting.

> Connect Light Cloud in ChatGPT. A Light Cloud sign-in page opens: sign in with the email and password above. There is no two-factor step or email code. Approve access. The workspace `Light Cloud review` has a static site, a server app and a connected GitHub account, which test case 2 uses to create a repository. Run cases 2, 3 and 5 in one conversation, in that order. Case 5 deletes the site that case 2 creates.

The reviewer account must also have a GitHub account connected, with the Light Cloud GitHub App installed. LISTINGS §0 does not list that yet, and test cases 2, 3 and 5 depend on it.
