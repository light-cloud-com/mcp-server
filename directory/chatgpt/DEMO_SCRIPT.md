# Demo recording script (60 to 90 seconds)

The review needs a video that shows the plugin working. This one follows test cases 1 to 3 in `TEST_CASES.md`: status, then a new site in a new repository deployed live, then a heading change committed and redeployed.

## Before recording

- Use production, with the Light Cloud plugin connected in ChatGPT. Sign in as the reviewer account, or another workspace that has a connected GitHub account and no real customer data.
- Run the three prompts once beforehand and delete the test site afterwards, so you know how long the builds take.
- Use a clean browser window. Hide bookmarks, other tabs, your email address and notifications. Record at 1080p or higher.
- You need two tabs: ChatGPT, and an empty tab for the live site.

## Script

| Time | On screen | Do or say |
| --- | --- | --- |
| 0:00 to 0:05 | ChatGPT, new chat, Light Cloud enabled | Caption: "Light Cloud in ChatGPT: build, deploy and manage sites." |
| 0:05 to 0:20 | Type **What's the status of my Light Cloud sites?** | The answer shows the account, the workspace, each app with its status and live address, the databases and the GitHub account. Pause on it for 3 seconds. |
| 0:20 to 0:30 | Type **Create a small HTML page for my bike repair shop in a new repository and deploy it.** | The tool calls appear: `get-git-connections`, `create-repository`, `create-application`. Approve any confirmation ChatGPT shows. |
| 0:30 to 0:45 | `wait-for-deployment` running | Speed this part up and caption it "Build sped up". The answer gives the live address and the repository link. |
| 0:45 to 0:55 | Open the live address in the second tab | The page loads with the shop heading. Open the repository link for 2 seconds to show the new private repository. |
| 0:55 to 1:05 | Back in ChatGPT, type **Change the main heading to "Repairs while you wait" and commit it.** | The tool call `commit-files` appears, then `wait-for-deployment` (sped up, captioned). |
| 1:05 to 1:15 | Reload the live site tab | The new heading shows at the same address. |
| 1:15 to 1:20 | End card | Caption: "light-cloud.com". |

After recording, delete the test site: ask "Delete the bike repair site you made." and confirm. This is test case 5. Delete the repository in GitHub if you don't want to keep it.

## Upload

Upload the video somewhere a reviewer can open it without signing in, such as an unlisted YouTube video or a link-shared file. Then put the address in `plugin.json` as `demo_recording_url` (it holds `REPLACE_ME_DEMO_RECORDING_URL` until then) and rebuild the ZIP (see README).
