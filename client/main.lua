local isUiOpen = false
local currentVehicleRadio = nil
local currentNetId = nil

-- On resource start, reset the NUI to a clean state.
-- FiveM's CEF frame often persists across resource restarts without reloading
-- the HTML page, so JS state (overlays, timers, audio) from the previous
-- session can survive and block the UI from opening.
AddEventHandler('onClientResourceStart', function(resourceName)
    if GetCurrentResourceName() ~= resourceName then return end
    SendNUIMessage({ action = "reset" })
end)

-- Generic server → NUI bridge (used by updater for restart warnings, etc.)
RegisterNetEvent("Radiocast:NUIMessage", function(payload)
    SendNUIMessage(payload)
end)

RegisterCommand(Config.CommandName, function()
    if isUiOpen then return end
    TriggerServerEvent("Radiocast:GetStations")
end, false)

RegisterNetEvent("Radiocast:ReceiveStations", function(stations)
    if not stations then return end
    isUiOpen = true
    SetNuiFocus(true, true)
    
    local ped = PlayerPedId()
    local inVehicle = IsPedInAnyVehicle(ped, false)
    local vehicleName = ""
    local controllingVehicle = false
    
    if inVehicle then
        local veh = GetVehiclePedIsIn(ped, false)
        local model = GetEntityModel(veh)
        vehicleName = GetLabelText(GetDisplayNameFromVehicleModel(model))
        if vehicleName == "NULL" then
            vehicleName = "Vehicle"
        end
        local netId = NetworkGetNetworkIdFromEntity(veh)
        if currentVehicleRadio ~= nil and currentNetId == netId then
            controllingVehicle = true
        end
    end

    SendNUIMessage({
        action = "open",
        stations = stations,
        inVehicle = inVehicle,
        vehicleName = vehicleName,
        controllingVehicle = controllingVehicle,
        vehicleStation = currentVehicleRadio
    })
end)

RegisterNUICallback("close", function(data, cb)
    isUiOpen = false
    SetNuiFocus(false, false)
    if cb then cb("ok") end
end)

RegisterNUICallback("musicStarted", function(data, cb)
    local ped = PlayerPedId()
    if IsPedInAnyVehicle(ped, false) then
        local veh = GetVehiclePedIsIn(ped, false)
        SetVehRadioStation(veh, "OFF")
    end
    if cb then cb("ok") end
end)

RegisterNUICallback("setVehicleRadio", function(data, cb)
    local ped = PlayerPedId()
    if IsPedInAnyVehicle(ped, false) then
        local veh = GetVehiclePedIsIn(ped, false)
        local netId = NetworkGetNetworkIdFromEntity(veh)
        TriggerServerEvent("Radiocast:SetVehicleRadio", netId, data.station)
    end
    if cb then cb("ok") end
end)

RegisterNUICallback("setVehicleVolume", function(data, cb)
    local ped = PlayerPedId()
    if IsPedInAnyVehicle(ped, false) then
        local veh = GetVehiclePedIsIn(ped, false)
        local netId = NetworkGetNetworkIdFromEntity(veh)
        TriggerServerEvent("Radiocast:SetVehicleVolume", netId, data.volume)
    end
    if cb then cb("ok") end
end)

local VehicleRadios = {}

RegisterNetEvent("Radiocast:SyncVehicleRadio", function(netId, station)
    VehicleRadios[netId] = station
end)

RegisterNetEvent("Radiocast:SyncVehicleVolume", function(netId, volume)
    if VehicleRadios[netId] then
        VehicleRadios[netId].sync_volume = volume
    end
end)

RegisterNetEvent("Radiocast:SyncAllVehicleRadios", function(radios)
    VehicleRadios = radios
end)

RegisterNetEvent("Radiocast:UpdateNowPlaying", function(nowPlayingData)
    for netId, station in pairs(VehicleRadios) do
        for _, np in ipairs(nowPlayingData) do
            if station.id == np.station.id then
                station.now_playing = np.now_playing
            end
        end
    end
    
    SendNUIMessage({
        action = "update_all_metadata",
        data = nowPlayingData
    })
end)

local maxDistance = 10.0

CreateThread(function()
    TriggerServerEvent("Radiocast:RequestVehicleRadios")
    while true do
        Wait(200)
        local ped = PlayerPedId()
        local coords = GetEntityCoords(ped)
        local currentVeh = GetVehiclePedIsIn(ped, false)
        
        local vehicles = GetGamePool('CVehicle')
        local nearbyRadios = {}
        
        for _, veh in ipairs(vehicles) do
            if NetworkGetEntityIsNetworked(veh) then
                local netId = NetworkGetNetworkIdFromEntity(veh)
                if netId > 0 and VehicleRadios[netId] then
                    local stateStation = VehicleRadios[netId]
                    local vehCoords = GetEntityCoords(veh)
                    local dist = #(coords - vehCoords)
                    
                    if dist <= (maxDistance * 3) then
                        local isInside = (veh == currentVeh)
                        local anyDoorOpen = false
                        
                        if not isInside then
                            for i = 0, 5 do
                                if GetVehicleDoorAngleRatio(veh, i) > 0.0 then
                                    anyDoorOpen = true
                                    break
                                end
                            end
                        end
                        
                        table.insert(nearbyRadios, {
                            netId = netId,
                            url = stateStation.listen_url,
                            baseVolume = stateStation.sync_volume or 0.5,
                            dist = isInside and 0.0 or dist,
                            doorsOpen = anyDoorOpen
                        })
                    end
                end
            end
        end
        
        SendNUIMessage({
            action = "sync_3d_audio",
            radios = nearbyRadios,
            maxDist = maxDistance
        })
        
        if currentVeh ~= 0 and NetworkGetEntityIsNetworked(currentVeh) then
            local netId = NetworkGetNetworkIdFromEntity(currentVeh)
            if netId and netId > 0 then
                local stateStation = VehicleRadios[netId]
                
                if netId ~= currentNetId or (stateStation and (not currentVehicleRadio or currentVehicleRadio.id ~= stateStation.id)) then
                    currentNetId = netId
                    currentVehicleRadio = stateStation
                    if stateStation then
                        SendNUIMessage({
                            action = "show_car_hud",
                            station = stateStation
                        })
                        SetVehicleRadioEnabled(currentVeh, false)
                        SetVehRadioStation(currentVeh, "OFF")
                    else
                        SendNUIMessage({ action = "hide_car_hud" })
                        SetVehicleRadioEnabled(currentVeh, true)
                    end
                elseif not stateStation and currentVehicleRadio then
                    currentVehicleRadio = nil
                    SendNUIMessage({ action = "hide_car_hud" })
                    SetVehicleRadioEnabled(currentVeh, true)
                end
            end
        else
            if currentNetId then
                currentNetId = nil
                currentVehicleRadio = nil
                SendNUIMessage({ action = "hide_car_hud" })
            end
        end
    end
end)
