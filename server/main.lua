local stationsCache = nil
local stationsCacheTime = 0
local STATIONS_CACHE_TTL = 300 -- 5 minutes in seconds

local function FetchStations()
    if not ServerConfig.APIKey or ServerConfig.APIKey == "YOUR_API_KEY_HERE" then
        print("^1[Radiocast4Fivem] ERROR: Please configure your API Key in server_config.lua^7")
        return
    end

    PerformHttpRequest("https://billing.radiocast.net/radiocastproxy/stations", function(err, text, headers)
        print("^3[Radiocast4Fivem] Attempting to fetch stations from API...^7")
        if err == 200 then
            local data = json.decode(text)
            if data then
                stationsCache = data
                stationsCacheTime = os.time()
                print("^2[Radiocast4Fivem] SUCCESS: Loaded " .. #data .. " stations.^7")
            else
                print("^1[Radiocast4Fivem] ERROR: Received 200 OK but JSON was invalid. Response: ^7\n" .. tostring(text))
            end
        else
            print("^1==========================================================^7")
            print("^1[Radiocast4Fivem] API REQUEST FAILED^7")
            print("^1URL: ^3https://billing.radiocast.net/radiocastproxy/stations^7")
            print("^1HTTP Status Code: ^3" .. tostring(err) .. "^7")
            print("^1Response Headers: ^3" .. json.encode(headers or {}) .. "^7")
            print("^1Response Body: ^7")
            print(tostring(text) or "No response body received.")
            print("^1==========================================================^7")
        end
    end, "GET", "", {
        ["Authorization"] = "Bearer " .. ServerConfig.APIKey,
        ["X-API-Key"] = ServerConfig.APIKey,
        ["Accept"] = "application/json",
        ["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    })
end

AddEventHandler('onResourceStart', function(resourceName)
    if (GetCurrentResourceName() ~= resourceName) then
        return
    end
    FetchStations()
end)

RegisterNetEvent("Radiocast:GetStations", function()
    local src = source

    -- Serve from cache if it is still fresh
    if stationsCache and (os.time() - stationsCacheTime) < STATIONS_CACHE_TTL then
        TriggerClientEvent("Radiocast:ReceiveStations", src, stationsCache)
        return
    end

    if not ServerConfig.APIKey or ServerConfig.APIKey == "YOUR_API_KEY_HERE" then
        TriggerClientEvent("Radiocast:ReceiveStations", src, {})
        return
    end

    -- Stale or empty cache — refresh from API
    PerformHttpRequest("https://billing.radiocast.net/radiocastproxy/stations", function(err, text, headers)
        print("^3[Radiocast4Fivem] Fetching stations from API (cache miss / expired)...^7")
        if err == 200 then
            local data = json.decode(text)
            if data then
                stationsCache = data
                stationsCacheTime = os.time()
                print("^2[Radiocast4Fivem] SUCCESS: Loaded " .. #data .. " stations (cache refreshed).^7")
                TriggerClientEvent("Radiocast:ReceiveStations", src, stationsCache)
            else
                -- Return stale cache rather than empty if we have it
                TriggerClientEvent("Radiocast:ReceiveStations", src, stationsCache or {})
            end
        else
            print("^1==========================================================^7")
            print("^1[Radiocast4Fivem] API REQUEST FAILED (Player Triggered)^7")
            print("^1HTTP Status Code: ^3" .. tostring(err) .. "^7")
            print("^1Response Body: ^7")
            print(tostring(text) or "No response body received.")
            print("^1==========================================================^7")
            -- Return stale cache rather than empty if we have it
            TriggerClientEvent("Radiocast:ReceiveStations", src, stationsCache or {})
        end
    end, "GET", "", {
        ["Authorization"] = "Bearer " .. ServerConfig.APIKey,
        ["X-API-Key"] = ServerConfig.APIKey,
        ["Accept"] = "application/json",
        ["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    })
end)

local VehicleRadios = {}

RegisterNetEvent("Radiocast:SetVehicleRadio", function(netId, station)
    if not netId then return end
    
    local oldVolume = 0.5
    if VehicleRadios[netId] and VehicleRadios[netId].sync_volume then
        oldVolume = VehicleRadios[netId].sync_volume
    end
    
    if station then
        station.sync_volume = oldVolume
    end
    
    VehicleRadios[netId] = station
    TriggerClientEvent("Radiocast:SyncVehicleRadio", -1, netId, station)
end)

RegisterNetEvent("Radiocast:SetVehicleVolume", function(netId, volume)
    if not netId then return end
    if VehicleRadios[netId] then
        VehicleRadios[netId].sync_volume = volume
        TriggerClientEvent("Radiocast:SyncVehicleVolume", -1, netId, volume)
    end
end)

RegisterNetEvent("Radiocast:RequestVehicleRadios", function()
    local src = source
    TriggerClientEvent("Radiocast:SyncAllVehicleRadios", src, VehicleRadios)
end)

CreateThread(function()
    while true do
        Wait(30000) -- Poll every 30s instead of 10s to reduce API load
        if ServerConfig.APIKey and ServerConfig.APIKey ~= "YOUR_API_KEY_HERE" then
            PerformHttpRequest("https://panel.radiocast.net/api/nowplaying", function(err, text, headers)
                if err == 200 then
                    local data = json.decode(text)
                    if data then
                        if stationsCache then
                            for _, npData in ipairs(data) do
                                for _, station in ipairs(stationsCache) do
                                    if station.id == npData.station.id then
                                        station.now_playing = npData.now_playing
                                        break
                                    end
                                end
                            end
                        end
                        TriggerClientEvent("Radiocast:UpdateNowPlaying", -1, data)
                    end
                end
            end, "GET", "", {
                ["Authorization"] = "Bearer " .. ServerConfig.APIKey,
                ["X-API-Key"] = ServerConfig.APIKey,
                ["Accept"] = "application/json",
                ["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            })
        end
    end
end)
