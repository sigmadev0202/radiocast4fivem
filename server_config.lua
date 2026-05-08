ServerConfig = {}

-- Your radiocast.net API key (Keep this secret)
-- If you don't set this correctly the resource will not load stations properly.
ServerConfig.APIKey = "CHANGE_ME_REQUEST_APIKEY_AT_RADIOCAST.NET_SUPPORT"

-- Set to true if you want the script to restart itself when an update is downloaded.
-- !!! If true, you MUST add `add_ace resource.Radiocast4Fivem command allow` to your server.cfg! !!!
ServerConfig.AutoRestart = false
