main.floors.MT0=
{
    "floorId": "MT0",
    "bgm": "wenwen.mp3",
    "title": "正面",
    "name": "正面",
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
    [  0,221, 81, 32, 81,  0,204,  0, 81, 32, 81,221,  0],
    [ 81,  0, 27,346,346,346,  0,346,346,346, 28,  0, 81],
    [346, 21,346,346, 31, 82,202, 82, 31,346,346, 21,346],
    [346,346, 31,346, 31,346, 21,346, 31,346, 31,346,346],
    [ 81,203, 81, 31, 23,346,202,346, 47, 31, 81,203, 81],
    [346, 32,346,346,346,124,233,129,346,346,346, 32,346],
    [  0,  0,219, 21,201,275,  0,248,201, 21,219,  0,  0],
    [203,346,346,346,346,126,250,125,346,346,346,346,203],
    [ 27,  0, 28,  0, 29,346,202,346, 33,  0, 34,  0, 32],
    [202,346,346,346,  0,346, 21,346,  0,346,346,346,202],
    [ 29, 34, 29,346,346, 21, 83, 32,346,346, 29, 34, 29],
    [ 81, 29, 22,346, 32,163, 27,163, 32,346, 22, 29, 81],
    [  0,221,346, 32, 31, 81,  0, 81, 31, 32,346,221,  0]
],
    "firstArrive": [
        "c键打开3d模型地图，点击立方体的图标也能打开。\n手机端按虚拟键盘图标，可以用方向键进行移动。"
    ],
    "parallelDo": "",
    "events": {
        "7,5": [
            "机关门事件开启条件如下：\n顶面击败所有骷髅士兵开启机关门\n底面击败所有初级法师和石头人开启机关门\n左面击败所有初级卫兵开启机关门\n右面击败所有初级卫兵开启机关门\n追猎，阻击，领域，激光，夹击，破墙镐，炸弹，开门，全都能跨层生效\n伯伯是加6防减9攻，商人是加6攻减9防\n本塔为实验ai造塔能力边界的作品，bug很多，遇到了可以进行反馈，但不一定能保证修复"
        ],
        "7,7": [
            {
                "type": "if",
                "condition": "flag:difficulty",
                "true": [
                    {
                        "type": "text",
                        "text": "\t[难度精灵,wizard]你已选择过难度（${flag:difficulty == 'easy' ? '简单' : '普通'}）。\n难度只能选择一次，无法更改。"
                    }
                ],
                "false": [
                    {
                        "type": "choices",
                        "text": "\t[难度精灵,wizard]你遇到了一位难度精灵。\n选择你的难度吧！（难度只能选择一次）",
                        "choices": [
                            {
                                "text": "简单难度（禁用地图伤害）",
                                "action": [
                                    {
                                        "type": "setValue",
                                        "name": "flag:difficulty",
                                        "value": "'easy'"
                                    },
                                    {
                                        "type": "setValue",
                                        "name": "flag:no_zone",
                                        "value": "true"
                                    },
                                    {
                                        "type": "setValue",
                                        "name": "flag:no_laser",
                                        "value": "true"
                                    },
                                    {
                                        "type": "setValue",
                                        "name": "flag:no_betweenAttack",
                                        "value": "true"
                                    },
                                    {
                                        "type": "setValue",
                                        "name": "flag:no_repulse_damage",
                                        "value": "true"
                                    },
                                    {
                                        "type": "setValue",
                                        "name": "flag:endingName",
                                        "value": "'简单'"
                                    },
                                    {
                                        "type": "text",
                                        "text": "\t[难度精灵,wizard]你选择了【简单】难度！\n所有地图伤害（激光/阻击/夹击/领域）已禁用，但阻击仍会把你击退。"
                                    }
                                ]
                            },
                            {
                                "text": "普通难度（保持原样）",
                                "action": [
                                    {
                                        "type": "setValue",
                                        "name": "flag:difficulty",
                                        "value": "'normal'"
                                    },
                                    {
                                        "type": "setValue",
                                        "name": "flag:endingName",
                                        "value": "'普通'"
                                    },
                                    {
                                        "type": "text",
                                        "text": "\t[难度精灵,wizard]你选择了【普通】难度！\n一切保持原样。"
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        ]
    },
    "changeFloor": {},
    "afterBattle": {},
    "afterGetItem": {},
    "afterOpenDoor": {},
    "cannotMove": {},
    "bgmap": [

],
    "fgmap": [

],
    "width": 13,
    "height": 13,
    "autoEvent": {},
    "beforeBattle": {},
    "cannotMoveIn": {}
}