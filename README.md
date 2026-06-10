# 高德地图 MCP Server · Amap MCP Server

[English](#english) | [中文](#chinese)

---

<a name="english"></a>
## 🇬🇧 English

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that wraps the [Amap (高德地图) Web Service APIs](https://lbs.amap.com/), giving AI assistants like Claude Code **9 map tools**: geocoding, route planning (driving/transit/walking/cycling), POI search, nearby search, distance measurement, and IP location.

> **Why this exists:** There was no publicly available Amap/Baidu Maps MCP Server on Smithery or anywhere else (as of 2026-06). Google Maps MCP exists but its China coverage is poor. This fills that gap.

### Features

| Tool | Description |
|------|-------------|
| `amap_geocode` | Address ↔ Coordinates (forward & reverse) |
| `amap_direction_driving` | 🚗 Driving directions with multi-strategy (fastest/cheapest/shortest/avoid-congestion) |
| `amap_direction_transit` | 🚌 Public transit directions (bus + subway) with cost & transfer info |
| `amap_direction_walking` | 🚶 Walking directions |
| `amap_direction_bicycling` | 🚲 Cycling directions |
| `amap_poi_search` | 🔍 POI search by keyword (restaurants, hotels, gas stations, etc.) |
| `amap_poi_around` | 📍 Nearby search within a radius |
| `amap_distance` | 📏 Batch distance/time measurement (up to 10 origins) |
| `amap_poi_ranking` | 🏆 Rating-based POI ranking — like Amap's "Street Ranking". Search by keyword, sort by rating/cost, top N |
| `amap_poi_detail` | 📋 POI detail lookup — get full info (rating, cost, hours, photos, reviews) by POI ID |
| `amap_weather` | 🌤 Weather query — real-time or 4-day forecast for any Chinese city |
| `amap_ip_location` | 🏠 IP-based coarse location (city level) |

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [Amap API Key](https://lbs.amap.com/) (Web Service type, NOT Web JS API)
  - Free tier: 5,000 calls/day per endpoint

### Installation

```bash
git clone https://github.com/zengzeruidd-a11y/amap-mcp-server.git
cd amap-mcp-server
npm install
```

### Configuration

Add to your Claude Code `.mcp.json` (global: `~/.claude/.mcp.json` or project: `.mcp.json`):

```json
{
  "amap": {
    "command": "node",
    "args": ["/path/to/amap-mcp-server/server.js"],
    "env": {
      "AMAP_KEY": "your-amap-api-key-here"
    }
  }
}
```

Restart Claude Code. The 9 tools will appear automatically.

For other MCP-compatible clients (Cursor, Windsurf, etc.), configure via their respective MCP settings.

### Usage Examples

Once configured, ask Claude:

> "What's the fastest driving route from 武汉天地 to 天河机场 on Saturday morning?"

> "Find hotpot restaurants within 2km of 光谷广场, sorted by rating"

> "How do I get from 汉口站 to 武昌站 by subway?"

> "Compare distances from my home, office, and the train station to 天河机场"

> "Find the top 10 highest-rated cocktail bars within 5km of 三乡, sorted by rating"

### API Reference

All tools use the Amap Web Service API v3/v4. See [Amap API Docs](https://lbs.amap.com/api/webservice/summary/) for details.

| Strategy | Driving | Transit |
|:--------:|---------|---------|
| 0 | Speed first | Fastest |
| 1 | Cost first | Cheapest |
| 2 | Distance first | Fewest transfers |
| 3 | Avoid congestion | Least walking |
| 4 | Avoid congestion + Speed first | — |
| 5 | Multi-strategy compare | No subway |

### License

MIT © 2026 曾泽瑞 (Zeng Zerui)

---

<a name="chinese"></a>
## 🇨🇳 中文

一个 [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) 服务器，封装了[高德地图 Web 服务 API](https://lbs.amap.com/)，为 Claude Code 等 AI 助手提供 **9 个地图工具**：地理编码、四种路径规划（驾车/公交/步行/骑行）、POI 搜索、周边搜索、距离测量、IP 定位。

> **为什么做这个：** 截至 2026 年 6 月，Smithery 等 MCP 市场上没有任何高德/百度地图的 MCP Server。Google Maps MCP 有，但国内路线覆盖差。这个项目填补了空白。

### 功能

| 工具 | 说明 |
|------|------|
| `amap_geocode` | 地址 ↔ 经纬度互转（正向 + 逆地理编码） |
| `amap_direction_driving` | 🚗 驾车路径规划，支持多策略（最快/最省钱/最短/躲避拥堵） |
| `amap_direction_transit` | 🚌 公交地铁规划，含票价、换乘次数、步行段 |
| `amap_direction_walking` | 🚶 步行导航 |
| `amap_direction_bicycling` | 🚲 骑行导航 |
| `amap_poi_search` | 🔍 关键词搜索地点（餐厅、酒店、加油站等） |
| `amap_poi_around` | 📍 周边搜索（指定半径） |
| `amap_poi_ranking` | 🏆 评分榜单——类似高德「扫街榜」，按评分/价格排序，Top N |
| `amap_poi_detail` | 📋 POI 详情——根据 ID 获取完整信息（评分/人均/营业时间/图片/评论） |
| `amap_weather` | 🌤 天气查询——全国城市实时天气或 4 日预报 |
| `amap_distance` | 📏 批量测距（最多 10 个起点同时比较） |
| `amap_ip_location` | 🏠 IP 粗略定位（城市级） |

### 前置条件

- [Node.js](https://nodejs.org/) ≥ 18
- [高德开放平台 API Key](https://lbs.amap.com/)（选 **Web 服务** 类型，不是 Web 端 JS API）
  - 免费额度：每个接口 5,000 次/天

### 安装

```bash
git clone https://github.com/zengzeruidd-a11y/amap-mcp-server.git
cd amap-mcp-server
npm install
```

### 配置

在 Claude Code 的 `.mcp.json` 中添加（全局：`~/.claude/.mcp.json` 或项目级：`.mcp.json`）：

```json
{
  "amap": {
    "command": "node",
    "args": ["/path/to/amap-mcp-server/server.js"],
    "env": {
      "AMAP_KEY": "你的高德API密钥"
    }
  }
}
```

重启 Claude Code，9 个工具自动加载。

其他 MCP 兼容客户端（Cursor、Windsurf 等）请参考各自的 MCP 配置方式。

### 使用示例

配置好后，直接问 Claude：

> "从武汉天地开车到天河机场，周六上午出发，哪条路线最快？"

> "光谷广场周边 2 公里内有没有评分高的火锅店？"

> "从汉口站到武昌站怎么坐地铁最快？"

> "帮我算一下从家、公司和火车站分别到天河机场的距离和时间"

> "三乡附近 5 公里内评分最高的 10 家清吧有哪些？按评分排"

### 驾车策略

| 策略 | 含义 |
|:----:|------|
| 0 | 速度优先（最快） |
| 1 | 费用优先（不走高速） |
| 2 | 距离优先 |
| 3 | 躲避拥堵（不走快速路） |
| 4 | 躲避拥堵 + 速度优先 |
| 5 | 多策略对比 |

### 公交策略

| 策略 | 含义 |
|:----:|------|
| 0 | 最快捷 |
| 1 | 最经济 |
| 2 | 最少换乘 |
| 3 | 最少步行 |
| 5 | 不乘地铁 |

### 已知限制

- 坐标格式：`lng,lat`（经度在前）—— 高德特有，非国际惯例
- 实时路况需要企业版权限，当前使用静态时间估算
- 公交跨城规划有限支持
- 海外地址覆盖有限，主要覆盖中国大陆

### License

MIT © 2026 曾泽瑞 (Zeng Zerui)
