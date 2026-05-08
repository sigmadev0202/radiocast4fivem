fx_version 'cerulean'
game 'gta5'

description 'Radiocast4Fivem'
version '1.0.0'
author 'Radiocast.net'

shared_script 'config.lua'

server_scripts {
    'server_config.lua',
    'server/main.lua',
    'server/updater.lua'
}

client_scripts {
    'client/main.lua'
}

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/style.css',
    'html/script.js',
    'html/radiocastlogo.webp'
}
