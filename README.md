# 🎙️ Radiocast FiveM Integration

A professional FiveM radio integration script powered by Radiocast. Access thousands of user-curated radio stations with exceptional reliability (99.9%+ uptime) directly in your FiveM server.

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Discord](https://img.shields.io/discord/g2twJYQrG8?label=Discord&logo=discord)](https://discord.gg/g2twJYQrG8)

---

## 📋 Table of Contents

- [Features](#-features)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Usage](#-usage)
- [Screenshots](#-screenshots)
- [API Integration](#-api-integration)
- [Troubleshooting](#-troubleshooting)
- [Support](#-support)
- [License](#-license)

---

## ✨ Features

- **Massive Station Library**: Access thousands of Radiocast stations
- **High Reliability**: 99.9%+ historical uptime
- **Auto-Updater**: Automatic resource updates with optional restart capability
- **In-Game UI**: Intuitive radio station selector panel
- **Car Overlay**: Vehicle-integrated radio display
- **Easy Integration**: Simple installation and configuration
- **Multi-Language Support**: Accessible to diverse server communities

---

## ⚠️ Prerequisites

### Required
- **FiveM Server** (Latest version recommended)
- **Radiocast API Key** (Free)

### Obtaining Your API Key

Choose one of the following methods to get your free API key:

1. **Discord**: Join our [community server](https://discord.gg/g2twJYQrG8) and request an API key
2. **Support Panel**: Visit our [billing support panel](https://billing.radiocast.net/support)
3. **Email**: Contact us directly through our support channels

> ⚠️ **Important**: API key abuse will result in immediate termination. Do not share your API key with anyone.

---

## 📥 Installation

### Step 1: Download
1. Navigate to the [releases page](https://github.com/yourcpuisoverheating/radiocast4fivem/releases)
2. Download the latest **radiocast4fivem-download** release

### Step 2: Extract & Install
1. Unzip the downloaded folder
2. Drag and drop the **radiocast4fivem-download** folder into your server's `resources` directory
3. Rename the folder to `radiocast4fivem` (optional but recommended)

### Step 3: Configure Server
Open your `server.cfg` file and add the following line:

```txt
ensure radiocast4fivem
```

This ensures Radiocast4FiveM starts automatically when your server launches.

### Step 4: Enable Auto-Updates (Optional)
To allow the auto-updater to restart the resource for updates, add this line to your `server.cfg`:

```txt
add_ace resource.radiocast4fivem command allow
```

---

## ⚙️ Configuration

### API Key Setup

1. Locate the configuration file in the resource folder
2. Add your Radiocast API key:

```lua
-- In the configuration file
RADIOCAST_API_KEY = "your_api_key_here"
```

### Customization

You can customize various aspects:
- UI theme and colors (CSS)
- Command names and permissions
- Default stations
- Overlay positioning

Refer to the included configuration documentation for detailed options.

---

## 🎮 Usage

### In-Game Commands

```
/radiocast - Opens the Radiocast stations panel
```

### Features
- Browse and search available radio stations
- Quick station switching
- Volume control
- Car-specific radio overlay
- Station favorites

---

## 📸 Screenshots

### Command Interface
<img width="766" height="209" alt="Command usage example" src="https://github.com/user-attachments/assets/e9911359-68e3-4d29-bd0b-b529d4f53aa5" />

*Command used to access the Radiocast stations panel*

### In-Game Radio Panel
<img width="1418" height="835" alt="Radio stations panel" src="https://github.com/user-attachments/assets/198d77ea-bbe3-4ff6-8633-d8420442db94" />

*In-game Radiocast stations panel with station listing and controls*

### Car Radio Overlay
<img width="1427" height="678" alt="Car radio overlay" src="https://github.com/user-attachments/assets/cddfaa6f-c633-48c2-89cd-075f7f672b00" />

*In-game Radiocast car overlay displaying current station information*

---

## 🔌 API Integration

### Architecture

This integration is built with:
- **JavaScript** (38.1%) - API communication and core logic
- **Lua** (37.3%) - FiveM scripting framework
- **CSS** (15%) - UI styling and design
- **HTML** (9.6%) - Interface markup

### API Communication

The resource communicates with Radiocast servers via REST API to:
- Fetch available stations
- Stream station data
- Handle playback controls
- Manage user preferences

### Rate Limiting

Be mindful of API rate limits. Excessive requests may result in API key termination.

---

## 🐛 Troubleshooting

### Resource Won't Start
- Verify `ensure radiocast4fivem` is in your `server.cfg`
- Check server logs for error messages
- Ensure the resource folder name is correct

### API Key Issues
- Confirm your API key is valid and active
- Check for typos in your configuration
- Verify the API key hasn't been revoked due to abuse

### UI Not Appearing
- Clear your FiveM cache
- Restart your server
- Check browser console for JavaScript errors
- Verify all UI files are present

### Audio Not Playing
- Check volume settings in-game
- Verify internet connection stability
- Try switching stations to test functionality

### Auto-Updater Not Working
- Ensure `add_ace resource.radiocast4fivem command allow` is in `server.cfg`
- Verify the resource has proper permissions
- Check server logs for update messages

---

## 🆘 Support

### Getting Help

- **Discord Community**: [Join us](https://discord.gg/g2twJYQrG8) for quick support
- **Support Panel**: [billing.radiocast.net/support](https://billing.radiocast.net/support)
- **GitHub Issues**: Report bugs and request features

### Common Issues

- [Rate limiting solutions](https://billing.radiocast.net/support)
- [Configuration help](https://discord.gg/g2twJYQrG8)
- [Integration troubleshooting](https://billing.radiocast.net/support)

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🤝 Contributing

We welcome contributions! Please feel free to submit pull requests or open issues for bugs and feature requests.

---

## ⚡ Performance Notes

- Minimal server resource usage
- Efficient API caching
- Optimized UI rendering
- Low bandwidth consumption

---

**Made with ❤️ for the FiveM community**

For more information, visit [Radiocast](https://radiocast.net) or join our [Discord](https://discord.gg/g2twJYQrG8).
