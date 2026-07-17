main.floors.MT3 = {
    "floorId": "MT3",
    "title": "立方体·右面",
    "name": "右面",
    "canFlyTo": true,
    "canFlyFrom": true,
    "canUseQuickShop": true,
    "cannotViewMap": false,
    "defaultGround": "ground",
    "images": [],
    "ratio": 1,
    "map": [
        [  0, 31,  0,  0, 28,  0,  0,  0, 27,  0,  0, 31,  0],
        [  0,  1,  0,202,  0,  0, 31,  0,  0,201,  0,  1,  0],
        [ 28,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0, 27],
        [  0,  0,  0,  0,  0,  0,221,  0,  0,  0,  0,  0,  0],
        [  0,  0,  0,  0,  1,  1, 85,  1,  1,  0,  0,  0,  0],
        [ 31,  0,  0,  0,  1, 28,  0, 27,  1,  0,  0,  0, 31],
        [  0,  0,  0,221, 85,  0,131,  0, 85,221,  0,  0,  0],
        [ 31,  0,  0,  0,  1, 27,  0, 28,  1,  0,  0,  0, 31],
        [  0,  0,  0,  0,  1,  1, 85,  1,  1,  0,  0,  0,  0],
        [  0,  0,  0,  0,  0,  0,221,  0,  0,  0,  0,  0,  0],
        [ 27,  0,  0,  0,  0,  0, 32,  0,  0,  0,  0,  0, 28],
        [  0,  1,  0,209,  0,  0, 31,  0,  0,205,  0,  1,  0],
        [  0, 31,  0,  0, 27,  0,  0,  0, 28,  0,  0, 31,  0]
    ],
    "firstArrive": [
        {"type":"text","text":"\t[金币商人,moneyShop]击败右面的四名初级卫兵，包围金币商店的四扇机关门会同时开启。"}
    ],
    "parallelDo": "",
    "events": {
        "6,6": [{"type":"function","function":"function(){core.openShop('moneyShop');}"}]
    },
    "changeFloor": {},
    "afterBattle": {
        "6,3": [{"type":"function","function":"function(){core.plugin.cubeWorld.openDoorsWhenClear('MT3',['yellowGateKeeper'],[[6,4],[4,6],[8,6],[6,8]]);}"}],
        "3,6": [{"type":"function","function":"function(){core.plugin.cubeWorld.openDoorsWhenClear('MT3',['yellowGateKeeper'],[[6,4],[4,6],[8,6],[6,8]]);}"}],
        "9,6": [{"type":"function","function":"function(){core.plugin.cubeWorld.openDoorsWhenClear('MT3',['yellowGateKeeper'],[[6,4],[4,6],[8,6],[6,8]]);}"}],
        "6,9": [{"type":"function","function":"function(){core.plugin.cubeWorld.openDoorsWhenClear('MT3',['yellowGateKeeper'],[[6,4],[4,6],[8,6],[6,8]]);}"}]
    },
    "afterGetItem": {},
    "afterOpenDoor": {},
    "cannotMove": {},
    "bgmap": [],
    "fgmap": [],
    "width": 13,
    "height": 13,
    "autoEvent": {},
    "beforeBattle": {},
    "cannotMoveIn": {}
};
