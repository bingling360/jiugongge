main.floors.MT2=
{
    "floorId": "MT2",
    "title": "左面",
    "name": "左面",
    "canFlyTo": true,
    "canFlyFrom": true,
    "canUseQuickShop": true,
    "cannotViewMap": false,
    "defaultGround": "ground",
    "images": [
        {
            "name": "floor_texture.jpg",
            "x": 0,
            "y": 0,
            "w": 416,
            "h": 416,
            "sx": 0,
            "sy": 0,
            "canvas": "bg"
        }
    ],
    "ratio": 1,
    "map": [
    [221,  1, 81, 81,  1, 81,  1,  1,  1,  1,  1,  1,221],
    [  1,  0, 27,  0,  1, 31,215, 32, 29, 28, 21,  0,  0],
    [  1, 28,  0,203, 82,  0,  1,  1,  1, 81,  1,  1,  0],
    [ 85, 82,  1, 81,  1,201, 82, 28,  1, 81,  1, 32,211],
    [  1, 27,215,203,  1,202,  1, 27,203, 34, 81,201, 28],
    [ 85, 28, 81,203,  1,203,  1, 82, 82,  1,  1,  1,  1],
    [ 82,217, 21, 81,130, 21,163,  0,  0,  0,  0,  0,  0],
    [ 85, 81,  1, 82,  1,  1,  1,  1, 82,  1,  1,  1,  1],
    [  1,  0, 28,  0,  1, 34, 29, 27,202, 82, 33, 50, 82],
    [ 85, 22,  0,215,  1,  0, 29,210,  0, 82, 22,211, 81],
    [  1,  1,  1, 81,  1,  1,  1, 81,  1,  1,  1, 81, 81],
    [  1, 32, 22,  0,213,  0, 32,  0, 27,204, 21, 21,  0],
    [221, 81, 81, 81, 81, 81, 81,  1,  1,  1,  1,  1,221]
],
    "firstArrive": [
        "，左面击败本层所有初级卫兵，将会开启左面所有机关门"
    ],
    "parallelDo": "",
    "events": {
        "4,6": {
            "event": [
                {
                    "type": "openShop",
                    "id": "shop2",
                    "open": true
                }
            ]
        }
    },
    "changeFloor": {},
    "afterBattle": {
        "0,0": [
            {
                "type": "setValue",
                "name": "flag:左面机关门计数",
                "operator": "+=",
                "value": "1"
            }
        ],
        "12,0": [
            {
                "type": "setValue",
                "name": "flag:左面机关门计数",
                "operator": "+=",
                "value": "1"
            }
        ],
        "0,12": [
            {
                "type": "setValue",
                "name": "flag:左面机关门计数",
                "operator": "+=",
                "value": "1"
            }
        ],
        "12,12": [
            {
                "type": "setValue",
                "name": "flag:左面机关门计数",
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
        "0,3": {
            "0": {
                "condition": "flag:左面机关门计数==4",
                "currentFloor": true,
                "priority": 0,
                "delayExecute": false,
                "multiExecute": false,
                "data": [
                    {
                        "type": "openDoor",
                        "loc": [
                            0,
                            3
                        ],
                        "async": true
                    },
                    {
                        "type": "openDoor",
                        "loc": [
                            0,
                            5
                        ],
                        "async": true
                    },
                    {
                        "type": "openDoor",
                        "loc": [
                            0,
                            7
                        ],
                        "async": true
                    },
                    {
                        "type": "openDoor",
                        "loc": [
                            0,
                            9
                        ],
                        "async": true
                    },
                    {
                        "type": "waitAsync"
                    },
                    {
                        "type": "setValue",
                        "name": "flag:左面机关门计数",
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