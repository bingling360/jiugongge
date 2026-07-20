main.floors.MT4=
{
    "floorId": "MT4",
    "title": "顶面",
    "name": "顶面",
    "canFlyTo": true,
    "canFlyFrom": true,
    "canUseQuickShop": true,
    "cannotViewMap": false,
    "defaultGround": "ground",
    "images": [],
    "ratio": 1,
    "map": [
    [  0,221,121, 85,121, 85, 83, 85,121, 85,121,221,  0],
    [ 34, 82,204, 27,210, 31,210, 31,210, 27,204, 82, 34],
    [164, 81, 32,210, 32,210, 21,210, 32,210, 32, 81,163],
    [164,  0, 30,  1,  1,  1,211,  1,  1,  1, 23,  0,163],
    [164,  1,121, 81, 27, 81, 81, 81, 22, 81,121,  1,163],
    [ 81,203,  0, 33,211, 82,204, 82,211, 33,  0,203, 81],
    [164,  1,121,  1,  0,  1,161,  1,  0,  1,121,  1,163],
    [164, 81, 27,213, 35,  1,203,  1, 35,213, 27, 81,163],
    [164, 81, 27, 81, 83,221,  0,221,121, 81, 27, 81,163],
    [164, 81, 82, 81, 34,  1, 49,  1, 34, 81, 82, 81,163],
    [161,  1, 21, 34, 33,  1,  0,  1, 33, 34, 21,  1,161],
    [ 34,  0,  1, 81,  1,  1, 31,  1,  1, 81,  1,  0, 34],
    [  0,221,161,162,161,  0,  0,  0,161,162,161,221,  0]
],
    "firstArrive": [
        "顶面击败本层所有骷髅士兵，将会开启顶面的所有机关门"
    ],
    "parallelDo": "",
    "events": {},
    "changeFloor": {},
    "afterBattle": {
        "4,1": [
            {
                "type": "setValue",
                "name": "flag:顶面机关门计数",
                "operator": "+=",
                "value": "1"
            }
        ],
        "6,1": [
            {
                "type": "setValue",
                "name": "flag:顶面机关门计数",
                "operator": "+=",
                "value": "1"
            }
        ],
        "8,1": [
            {
                "type": "setValue",
                "name": "flag:顶面机关门计数",
                "operator": "+=",
                "value": "1"
            }
        ],
        "3,2": [
            {
                "type": "setValue",
                "name": "flag:顶面机关门计数",
                "operator": "+=",
                "value": "1"
            }
        ],
        "5,2": [
            {
                "type": "setValue",
                "name": "flag:顶面机关门计数",
                "operator": "+=",
                "value": "1"
            }
        ],
        "7,2": [
            {
                "type": "setValue",
                "name": "flag:顶面机关门计数",
                "operator": "+=",
                "value": "1"
            }
        ],
        "9,2": [
            {
                "type": "setValue",
                "name": "flag:顶面机关门计数",
                "operator": "+=",
                "value": "1"
            }
        ]
    },
    "afterGetItem": {},
    "afterOpenDoor": {},
    "cannotMove": {},
    "bgmap": [

],
    "fgmap": [

],
    "width": 13,
    "height": 13,
    "autoEvent": {
        "3,0": {
            "0": {
                "condition": "flag:顶面机关门计数==7",
                "currentFloor": true,
                "priority": 0,
                "delayExecute": false,
                "multiExecute": false,
                "data": [
                    {
                        "type": "openDoor",
                        "loc": [
                            3,
                            0
                        ],
                        "async": true
                    },
                    {
                        "type": "openDoor",
                        "loc": [
                            5,
                            0
                        ],
                        "async": true
                    },
                    {
                        "type": "openDoor",
                        "loc": [
                            7,
                            0
                        ],
                        "async": true
                    },
                    {
                        "type": "openDoor",
                        "loc": [
                            9,
                            0
                        ],
                        "async": true
                    },
                    {
                        "type": "waitAsync"
                    },
                    {
                        "type": "setValue",
                        "name": "flag:顶面机关门计数",
                        "operator": "=",
                        "value": "null"
                    }
                ]
            }
        }
    },
    "beforeBattle": {},
    "cannotMoveIn": {}
}