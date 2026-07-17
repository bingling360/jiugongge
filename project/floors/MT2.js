main.floors.MT2 = {
    "floorId": "MT2",
    "title": "立方体·左面",
    "name": "左面",
    "canFlyTo": true,
    "canFlyFrom": true,
    "canUseQuickShop": true,
    "cannotViewMap": false,
    "defaultGround": "ground",
    "images": [],
    "ratio": 1,
    "map": [
        [  0, 31,  0,  0, 27,  0,  0,  0, 28,  0,  0, 31,  0],
        [  0,  1,  0,201,  0,  0, 31,  0,  0,202,  0,  1,  0],
        [ 27,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0, 28],
        [  0,  0,  0,  0,  0,  0,221,  0,  0,  0,  0,  0,  0],
        [  0,  0,  0,  0,  1,  1, 85,  1,  1,  0,  0,  0,  0],
        [ 31,  0,  0,  0,  1, 27,  0, 28,  1,  0,  0,  0, 31],
        [  0,  0,  0,221, 85,  0,130,  0, 85,221,  0,  0,  0],
        [ 31,  0,  0,  0,  1, 28,  0, 27,  1,  0,  0,  0, 31],
        [  0,  0,  0,  0,  1,  1, 85,  1,  1,  0,  0,  0,  0],
        [  0,  0,  0,  0,  0,  0,221,  0,  0,  0,  0,  0,  0],
        [ 28,  0,  0,  0,  0,  0, 32,  0,  0,  0,  0,  0, 27],
        [  0,  1,  0,205,  0,  0, 31,  0,  0,209,  0,  1,  0],
        [  0, 31,  0,  0, 28,  0,  0,  0, 27,  0,  0, 31,  0]
    ],
    "firstArrive": [
        {"type":"text","text":"\t[经验贤者,expShop]击败左面的四名初级卫兵，包围经验商店的四扇机关门会同时开启。"}
    ],
    "parallelDo": "",
    "events": {
        "6,6": [{"type":"function","function":"function(){core.openShop('expShop');}"}]
    },
    "changeFloor": {},
    "afterBattle": {
        "6,3": [{"type":"function","function":"function(){core.plugin.cubeWorld.openDoorsWhenClear('MT2',['yellowGateKeeper'],[[6,4],[4,6],[8,6],[6,8]]);}"}],
        "3,6": [{"type":"function","function":"function(){core.plugin.cubeWorld.openDoorsWhenClear('MT2',['yellowGateKeeper'],[[6,4],[4,6],[8,6],[6,8]]);}"}],
        "9,6": [{"type":"function","function":"function(){core.plugin.cubeWorld.openDoorsWhenClear('MT2',['yellowGateKeeper'],[[6,4],[4,6],[8,6],[6,8]]);}"}],
        "6,9": [{"type":"function","function":"function(){core.plugin.cubeWorld.openDoorsWhenClear('MT2',['yellowGateKeeper'],[[6,4],[4,6],[8,6],[6,8]]);}"}]
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
