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
    "images": [],
    "ratio": 1,
    "map": [
    [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0]
    ],
    "firstArrive": [
        "，左面击败本层所有初级卫兵，将会开启左面所有机关门"
    ],
    "parallelDo": "",
    "events": {},
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