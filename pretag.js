/**
 * pretag.js - BedrockBridge Offline Nametag Pre-loader Plugin
 *
 * Uses @minecraft/server:
 * - Listens for player spawn events to restore pending offline nametag changes
 * - Retrieves cached nametag data from world dynamic properties
 * - Applies custom nametags (esp:nameTag) to player entities upon join
 * - Cleans up offline temporary storage post-application
 * 
 * v2.0.0 by beeeeeeeluga (https://github.com/Beeeeeeeluga)
 * Discord: beeeeeeeluga (807236027189297212) 
 * More plugins: https://discord.gg/kB7dWtQZKx
 *
 * Addon Support Server: https://discord.com/invite/esploratori-development-1043447184210792468
 */

import { world, system } from "@minecraft/server";

// ==========================================================
// Offline Nametag
// 用途：
// 玩家離線時預約暱稱。
// 玩家重新登入後，自動將暱稱寫入 Proximity Text Chat
// Addon 所使用的 Dynamic Property：esp:nameTag
// ==========================================================

const STORAGE_PREFIX = "offlinetag:";
const NAMETAG_PROPERTY = "esp:nameTag";

// ==========================================================
// 工具函式
// ==========================================================

function getStorageKey(playerName) {
    return `${STORAGE_PREFIX}${playerName.toLowerCase()}`;
}

function getPendingNameTag(playerName) {
    try {
        return world.getDynamicProperty(getStorageKey(playerName));
    } catch (error) {
        console.error(
            `[OfflineNametag] 讀取暫存失敗 (${playerName}): ${error}`
        );
        return undefined;
    }
}

function removePendingNameTag(playerName) {
    try {
        // undefined 會刪除 Dynamic Property
        world.setDynamicProperty(getStorageKey(playerName), undefined);

        console.warn(
            `[OfflineNametag] 已清除離線暱稱暫存: ${playerName}`
        );

        return true;
    } catch (error) {
        console.error(
            `[OfflineNametag] 清除暫存失敗 (${playerName}): ${error}`
        );

        return false;
    }
}

function savePendingNameTag(playerName, nameTag) {
    try {
        if (!playerName || !nameTag) {
            console.error(
                `[OfflineNametag] 無法儲存：playerName 或 nameTag 為空`
            );
            return false;
        }

        world.setDynamicProperty(
            getStorageKey(playerName),
            nameTag
        );

        console.warn(
            `[OfflineNametag] 已儲存離線暱稱: ${playerName} -> ${nameTag}`
        );

        return true;
    } catch (error) {
        console.error(
            `[OfflineNametag] 儲存暱稱失敗 (${playerName}): ${error}`
        );

        return false;
    }
}

// ==========================================================
// 套用暱稱
// ==========================================================

function applyPendingNameTag(player) {
    if (!player) return;

    const playerName = player.name;
    const storageKey = getStorageKey(playerName);

    let pendingNameTag;

    try {
        pendingNameTag = world.getDynamicProperty(storageKey);
    } catch (error) {
        console.error(
            `[OfflineNametag] 無法讀取 ${storageKey}: ${error}`
        );
        return;
    }

    // 沒有等待中的暱稱
    if (typeof pendingNameTag !== "string" || pendingNameTag.length === 0) {
        return;
    }

    console.warn(
        `[OfflineNametag] 發現待套用暱稱: ${playerName} -> ${pendingNameTag}`
    );

    // ------------------------------------------------------
    // 不在 playerSpawn 當下立即寫入。
    //
    // 先讓玩家完成登入與其他 addon 的 playerSpawn 初始化，
    // 再寫入 esp:nameTag。
    // ------------------------------------------------------

    system.runTimeout(() => {
        try {
            // 確認玩家目前仍然在線
            const onlinePlayer = world
                .getAllPlayers()
                .find(
                    p => p.name.toLowerCase() === playerName.toLowerCase()
                );

            if (!onlinePlayer) {
                console.warn(
                    `[OfflineNametag] 玩家 ${playerName} 已不在線，保留暫存。`
                );
                return;
            }

            console.warn(
                `[OfflineNametag] 正在套用暱稱: ${playerName} -> ${pendingNameTag}`
            );

            // ==================================================
            // 核心：
            // Proximity Text Chat addon 的正式暱稱 Property
            // ==================================================

            onlinePlayer.setDynamicProperty(
                NAMETAG_PROPERTY,
                pendingNameTag
            );

            // --------------------------------------------------
            // 驗證 Dynamic Property 是否真的寫入
            // --------------------------------------------------

            const verifyNameTag =
                onlinePlayer.getDynamicProperty(NAMETAG_PROPERTY);

            if (verifyNameTag !== pendingNameTag) {
                console.error(
                    `[OfflineNametag] 暱稱驗證失敗！` +
                    `預期="${pendingNameTag}", ` +
                    `實際="${verifyNameTag}"`
                );

                // 驗證失敗絕對不能刪除暫存
                // 下一次登入還可以重新嘗試
                return;
            }

            console.warn(
                `[OfflineNametag] esp:nameTag 寫入並驗證成功: ${pendingNameTag}`
            );

            // --------------------------------------------------
            // Dynamic Property 成功後，再更新實際顯示的 nameTag
            //
            // 目前你的 data.js 預設 do_name_template=false，
            // 因此直接顯示 esp:nameTag。
            // --------------------------------------------------

            onlinePlayer.nameTag = pendingNameTag;

            // --------------------------------------------------
            // 再次確認玩家仍然存在
            // --------------------------------------------------

            const stillOnline = world
                .getAllPlayers()
                .some(
                    p => p.name.toLowerCase() === playerName.toLowerCase()
                );

            if (!stillOnline) {
                console.warn(
                    `[OfflineNametag] 玩家在處理完成前離線，保留暫存。`
                );
                return;
            }

            // --------------------------------------------------
            // 所有步驟成功後才刪除離線暫存
            // --------------------------------------------------

            removePendingNameTag(playerName);

            console.warn(
                `[OfflineNametag] 暱稱套用完成: ${playerName} -> ${pendingNameTag}`
            );

        } catch (error) {
            console.error(
                `[OfflineNametag] 套用暱稱失敗 (${playerName}): ${error}`
            );

            if (error?.stack) {
                console.error(
                    `[OfflineNametag] Stack:\n${error.stack}`
                );
            }

            // 注意：
            // 這裡不刪除 pending property。
            // 玩家下一次登入仍然可以重新嘗試。
        }
    }, 40);
}

// ==========================================================
// 玩家登入
// ==========================================================

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
    if (!player || !initialSpawn) {
        return;
    }

    applyPendingNameTag(player);
});


// ==========================================================
// 管理用 API
//
// 如果其他插件需要替離線玩家設定暱稱，
// 可以直接使用：
//
// setOfflineNameTag("玩家名稱", "新的暱稱");
// ==========================================================

export function setOfflineNameTag(playerName, nameTag) {
    return savePendingNameTag(playerName, nameTag);
}


// ==========================================================
// 管理用 API
//
// 清除某個玩家尚未套用的離線暱稱
// ==========================================================

export function clearOfflineNameTag(playerName) {
    return removePendingNameTag(playerName);
}
