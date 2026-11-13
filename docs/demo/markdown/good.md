# Acme Tool setup guide

Connect Acme Tool to your account. Pick one of two modes.

## Requirements

- Windows 10 or later
- An API key from your administrator
- About 10 minutes

## Choose a mode

| Item | CLI | Desktop |
|---|---|---|
| 介面 | Terminal | Desktop app |
| 設定 | Run `acme setup` | Fill in 3 fields |
| 每次 | Run `acme` | Open `Acme.exe` |
| 路徑 | 資料夾內的 `data` | `%APPDATA%/Acme` |
| 設定檔 | `config.json` 在資料夾內 | 存在使用者設定 |

See [Install](#install) for the steps.

## Install

1. Download the archive and extract it.
2. Save the settings file as `config.json`:

   ```json
   {
     "endpoint": "https://api.example.com/v1",
     "model": "example-model"
   }
   ```

3. Start the tool and send one message.

Expected result:

- ✅ The tool prints a reply within a few seconds
- ❌ `401` means the key is wrong; paste it again

## Troubleshooting

| Symptom | Fix |
|---|---|
| 逾時 | Check the network or VPN, then run the command again |
| `401` | The key is wrong or expired. Paste a new one |
| 找不到檔案 | Make sure `config.json` is in the same folder as the executable |
