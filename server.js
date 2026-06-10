import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const AMAP_KEY = process.env.AMAP_KEY || "";
const AMAP_BASE = "https://restapi.amap.com";

// ── HTTP helper ──────────────────────────────────────────────
async function amapGet(path, params = {}) {
  const url = new URL(AMAP_BASE + path);
  url.searchParams.set("key", AMAP_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

// ── Formatters ───────────────────────────────────────────────
function formatDrivingSteps(route) {
  const lines = [];
  for (const step of route.steps || []) {
    const road = step.roads?.[0]?.road_name || step.instruction || "";
    const dist = step.distance ? `${step.distance}m` : "";
    const dur = step.duration ? `${Math.round(Number(step.duration) / 60)}min` : "";
    const action = step.action || "";
    lines.push(`  ${action} → ${road}  ${dist} ${dur}`);
  }
  return lines.join("\n");
}

function formatTransitSteps(route) {
  const lines = [];
  for (const seg of route.segments || []) {
    if (seg.bus) {
      const bus = seg.bus;
      const lines_info = bus.buslines?.map(l =>
        `    🚌 ${l.name} | ${l.departure_stop?.name} → ${l.arrival_stop?.name} | ${l.duration ? Math.round(Number(l.duration) / 60) + "min" : ""} | ${l.via_stops?.length || 0}站`
      ).join("\n") || "";
      lines.push(`  🚏 ${bus.departure?.name || ""} → ${bus.arrival?.name || ""}\n${lines_info}`);
    } else if (seg.walking) {
      lines.push(`  🚶 步行 ${seg.walking.distance}m`);
    } else if (seg.railway) {
      const rw = seg.railway;
      lines.push(`  🚇 ${rw.departure?.name} → ${rw.arrival?.name} | ${rw.trip?.name || ""} | ${rw.duration ? Math.round(Number(rw.duration) / 60) + "min" : ""}`);
    }
  }
  return lines.join("\n");
}

function formatPOI(poi) {
  return [
    `📌 ${poi.name}`,
    `   地址: ${poi.address || "—"}`,
    `   类型: ${poi.type || "—"}`,
    `   距离: ${poi.distance ? poi.distance + "m" : "—"}`,
    `   电话: ${poi.tel || "—"}`,
    `   评分: ${poi.biz_ext?.rating || "—"}`,
  ].join("\n");
}

// ── Tool definitions ─────────────────────────────────────────
const TOOLS = [
  {
    name: "amap_geocode",
    description:
      "地址 ↔ 经纬度互转。传入 address 将地址解析为经纬度；传入 location（lng,lat）做逆地理编码返回结构化地址。做任何路径规划前，先用此工具获取起点/终点的坐标。",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string", description: "结构化地址，如「北京市朝阳区阜通东大街6号」" },
        city: { type: "string", description: "城市，缩小搜索范围，如「北京」" },
        location: { type: "string", description: "经纬度（lng,lat），做逆地理编码时使用，如「116.481488,39.990464」" },
      },
    },
  },
  {
    name: "amap_direction_driving",
    description:
      "驾车路径规划。传入起点/终点（支持坐标或地址），返回最优路线——含总距离、预计时间、沿途步骤、过路费、红绿灯数。strategy: 0=速度优先, 1=费用优先, 2=距离优先, 3=躲避拥堵(不走快速路), 4=躲避拥堵&速度优先, 5=多策略对比。",
    inputSchema: {
      type: "object",
      properties: {
        origin: { type: "string", description: "起点，支持坐标（lng,lat）或地址" },
        destination: { type: "string", description: "终点，支持坐标（lng,lat）或地址" },
        origin_type: { type: "integer", description: "origin为坐标时填1，地址时填0或不传" },
        destination_type: { type: "integer", description: "destination为坐标时填1，地址时填0或不传" },
        strategy: { type: "integer", description: "策略: 0-速度优先, 1-费用优先, 2-距离优先, 3-躲避拥堵, 4-躲避拥堵&速度优先, 5-多策略" },
        waypoints: { type: "string", description: "途经点，最多16个，坐标用;分隔，如 116.46,39.92;116.47,39.93" },
        avoidroad: { type: "string", description: "避开路段名称" },
        avoidpolygons: { type: "string", description: "避开区域，格式 lng,lat;lng,lat;...（多边形）" },
      },
      required: ["origin", "destination"],
    },
  },
  {
    name: "amap_direction_transit",
    description:
      "公交/地铁路径规划。传入起点/终点和所在城市，返回公交换乘方案——含步行段、公交线路、地铁线路、换乘次数、总耗时、票价。",
    inputSchema: {
      type: "object",
      properties: {
        origin: { type: "string", description: "起点，支持坐标（lng,lat）或地址" },
        destination: { type: "string", description: "终点，支持坐标（lng,lat）或地址" },
        city: { type: "string", description: "城市，如「北京」" },
        cityd: { type: "string", description: "终点城市（跨城时使用）" },
        strategy: { type: "integer", description: "策略: 0-最快捷, 1-最经济, 2-最少换乘, 3-最少步行, 5-不乘地铁" },
        date: { type: "string", description: "日期，YYYY-MM-DD" },
        time: { type: "string", description: "时间，HH:MM" },
      },
      required: ["origin", "destination", "city"],
    },
  },
  {
    name: "amap_direction_walking",
    description: "步行路径规划。返回步行路线——总距离、预计时间、每一步指引。",
    inputSchema: {
      type: "object",
      properties: {
        origin: { type: "string", description: "起点" },
        destination: { type: "string", description: "终点" },
      },
      required: ["origin", "destination"],
    },
  },
  {
    name: "amap_direction_bicycling",
    description: "骑行路径规划。返回骑行路线——总距离、预计时间、沿途道路。",
    inputSchema: {
      type: "object",
      properties: {
        origin: { type: "string", description: "起点" },
        destination: { type: "string", description: "终点" },
      },
      required: ["origin", "destination"],
    },
  },
  {
    name: "amap_poi_search",
    description:
      "POI（兴趣点）搜索。按关键词或类型搜索地点——餐厅、酒店、景点、加油站、停车场等。支持城市范围过滤。",
    inputSchema: {
      type: "object",
      properties: {
        keywords: { type: "string", description: "搜索关键词，如「故宫」「海底捞」「加油站」" },
        types: { type: "string", description: "POI类型代码，如「050000」（餐饮）、「060000」（购物）" },
        city: { type: "string", description: "城市，如「北京」或城市编码" },
        citylimit: { type: "string", description: "true=仅限指定城市内搜索" },
        offset: { type: "integer", description: "每页条数，默认20，最大25" },
        page: { type: "integer", description: "页码" },
      },
      required: ["keywords"],
    },
  },
  {
    name: "amap_poi_around",
    description:
      "周边搜索。给定中心点和半径，搜索周边POI——找附近的餐厅、停车场、银行等。",
    inputSchema: {
      type: "object",
      properties: {
        location: { type: "string", description: "中心点坐标（lng,lat）" },
        keywords: { type: "string", description: "搜索关键词" },
        types: { type: "string", description: "POI类型代码" },
        radius: { type: "integer", description: "搜索半径（米），默认3000，最大50000" },
        sortrule: { type: "string", description: "排序: distance=距离, weight=权重" },
        offset: { type: "integer", description: "每页条数" },
      },
      required: ["location"],
    },
  },
  {
    name: "amap_distance",
    description:
      "距离测量。计算多个起点到一个终点的驾车距离和时间。用于比较不同出发点的可达性。",
    inputSchema: {
      type: "object",
      properties: {
        origins: { type: "string", description: "起点坐标列表，最多10个，用|分隔，如 116.38,39.92|116.46,39.99" },
        destination: { type: "string", description: "终点坐标（lng,lat）" },
        type: { type: "integer", description: "0=直线距离, 1=驾车距离, 2=步行距离（限5km内）, 3=骑行距离（限20km内）" },
      },
      required: ["origins", "destination"],
    },
  },
  {
    name: "amap_ip_location",
    description: "IP 定位。获取当前网络出口的粗略位置（城市级别），用于快速确定「我在哪」。无需任何参数。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "amap_poi_ranking",
    description:
      "POI 评分榜单 —— 类似高德「扫街榜」。搜索指定区域/城市内某类POI，按评分/价格排序，返回Top N。找好餐厅、好酒吧、热门打卡地就用这个。",
    inputSchema: {
      type: "object",
      properties: {
        keywords: { type: "string", description: "搜索关键词，如「清吧」「西餐」「糖水」「火锅」" },
        types: { type: "string", description: "POI类型代码，如「050100」（中餐厅）「050200」（外国餐厅）" },
        city: { type: "string", description: "城市，如「中山」「珠海」" },
        location: { type: "string", description: "中心点坐标（lng,lat），传入后做周边搜索并按评分排序" },
        radius: { type: "integer", description: "周边搜索半径（米），默认 5000，最大 50000" },
        sort: { type: "string", description: "排序方式: rating=评分降序（默认）, cost_asc=价格升序, cost_desc=价格降序" },
        top: { type: "integer", description: "返回前N条，默认10，最大25" },
        min_rating: { type: "string", description: "最低评分过滤，如「4.0」只返回4星以上" },
      },
      required: ["keywords"],
    },
  },
];

// ── Server ───────────────────────────────────────────────────
const server = new Server(
  { name: "amap-mcp-server", version: "1.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ── Geocode ─────────────────────────────────────
      case "amap_geocode": {
        if (args?.location) {
          const data = await amapGet("/v3/geocode/regeo", {
            location: args.location,
            radius: 1000,
            extensions: "base",
          });
          const regeo = data.regeocode;
          if (!regeo) return { content: [{ type: "text", text: "逆地理编码失败，无结果" }] };
          const ac = regeo.addressComponent || {};
          return {
            content: [{
              type: "text",
              text: [
                `📍 坐标 ${args.location} →`,
                `   结构化地址: ${regeo.formatted_address || "—"}`,
                `   省: ${ac.province || "—"}  市: ${ac.city || "—"}  区: ${ac.district || "—"}`,
                `   街道: ${ac.streetnumber?.street || "—"}${ac.streetnumber?.number || ""}`,
                `   商圈: ${(regeo.pois || []).slice(0, 3).map(p => p.name).join(" / ") || "—"}`,
              ].join("\n"),
            }],
          };
        }
        if (args?.address) {
          const data = await amapGet("/v3/geocode/geo", {
            address: args.address,
            city: args.city || "",
          });
          const geos = data.geocodes || [];
          if (!geos.length) return { content: [{ type: "text", text: `地址「${args.address}」未找到匹配结果 (${data.info || "UNKNOWN"})` }] };
          return {
            content: [{
              type: "text",
              text: geos.map((g, i) =>
                `${i === 0 ? "✅" : "  "} ${g.formatted_address}\n   坐标: ${g.location}  (置信度: ${g.level || "—"})`
              ).join("\n"),
            }],
          };
        }
        return { content: [{ type: "text", text: "请提供 address 或 location" }] };
      }

      // ── Driving ─────────────────────────────────────
      case "amap_direction_driving": {
        const data = await amapGet("/v3/direction/driving", {
          origin: args?.origin,
          destination: args?.destination,
          origin_type: args?.origin_type,
          destination_type: args?.destination_type,
          strategy: args?.strategy ?? 0,
          waypoints: args?.waypoints,
          avoidroad: args?.avoidroad,
          avoidpolygons: args?.avoidpolygons,
          extensions: "all",
          show_fields: "cost,tmcs,navi,crosses,polyline,traffic_light_num",
        });
        if (!data?.route?.paths?.length) {
          return { content: [{ type: "text", text: `驾车路线规划失败：${data?.info || "无可用路线"}` }] };
        }
        const out = [];
        out.push(`## 🚗 驾车路线 | ${args?.origin} → ${args?.destination}\n`);
        for (let i = 0; i < data.route.paths.length; i++) {
          const p = data.route.paths[i];
          const cost = p.cost ? JSON.parse(p.cost) : {};
          out.push(`### 方案${i + 1}`);
          out.push(`| 项目 | 值 |`);
          out.push(`|------|-----|`);
          out.push(`| 距离 | ${p.distance ? (Number(p.distance) / 1000).toFixed(1) + " km" : "—"} |`);
          out.push(`| 耗时 | ${p.duration ? Math.round(Number(p.duration) / 60) + " 分钟" : "—"} |`);
          out.push(`| 策略 | ${p.strategy || "—"} |`);
          out.push(`| 过路费 | ${cost.tolls ? "¥" + cost.tolls : "0"} |`);
          out.push(`| 红绿灯 | ${p.traffic_light_num || 0} 个 |`);
          out.push(`| 限行 | ${p.restriction === 0 ? "无" : "有限行路段"} |`);
          out.push("");
          out.push("**步骤：**");
          out.push("```");
          out.push(formatDrivingSteps(p));
          out.push("```");
          out.push("");
        }
        return { content: [{ type: "text", text: out.join("\n") }] };
      }

      // ── Transit ─────────────────────────────────────
      case "amap_direction_transit": {
        const data = await amapGet("/v3/direction/transit/integrated", {
          origin: args?.origin,
          destination: args?.destination,
          city: args?.city,
          cityd: args?.cityd,
          strategy: args?.strategy ?? 0,
          date: args?.date,
          time: args?.time,
        });
        if (!data?.route?.transits?.length) {
          return { content: [{ type: "text", text: `公交路线规划失败：${data?.info || "无可用路线"}` }] };
        }
        const out = [];
        out.push(`## 🚌 公交/地铁 | ${args?.origin} → ${args?.destination}\n`);
        for (let i = 0; i < data.route.transits.length; i++) {
          const t = data.route.transits[i];
          const walkDist = t.walking_distance ? `${t.walking_distance}m` : "—";
          out.push(`### 方案${i + 1}`);
          out.push(`| 项目 | 值 |`);
          out.push(`|------|-----|`);
          out.push(`| 总耗时 | ${t.duration ? Math.round(Number(t.duration) / 60) + " 分钟" : "—"} |`);
          out.push(`| 总距离 | ${t.distance ? (Number(t.distance) / 1000).toFixed(1) + " km" : "—"} |`);
          out.push(`| 步行距离 | ${walkDist} |`);
          out.push(`| 换乘次数 | ${t.segments ? t.segments.filter(s => s.bus || s.railway).length - 1 : 0} 次 |`);
          out.push(`| 票价 | ${t.cost ? "¥" + t.cost : "—"} |`);
          out.push("");
          out.push("**换乘步骤：**");
          out.push("```");
          out.push(formatTransitSteps(t));
          out.push("```");
          out.push("");
        }
        return { content: [{ type: "text", text: out.join("\n") }] };
      }

      // ── Walking ─────────────────────────────────────
      case "amap_direction_walking": {
        const data = await amapGet("/v3/direction/walking", {
          origin: args?.origin,
          destination: args?.destination,
        });
        if (!data?.route?.paths?.length) {
          return { content: [{ type: "text", text: `步行路线规划失败：${data?.info || "无可用路线"}` }] };
        }
        const p = data.route.paths[0];
        return {
          content: [{
            type: "text",
            text: [
              `## 🚶 步行 | ${args?.origin} → ${args?.destination}`,
              ``,
              `| 项目 | 值 |`,
              `|------|-----|`,
              `| 距离 | ${p.distance ? (Number(p.distance) / 1000).toFixed(1) + " km" : "—"} |`,
              `| 耗时 | ${p.duration ? Math.round(Number(p.duration) / 60) + " 分钟" : "—"} |`,
              ``,
              "**步骤：**",
              "```",
              (p.steps || []).map(s =>
                `  ${s.instruction || ""}  ${s.distance || 0}m  (~${s.duration ? Math.round(Number(s.duration)/60) + "min" : "?"})`
              ).join("\n"),
              "```",
            ].join("\n"),
          }],
        };
      }

      // ── Bicycling ───────────────────────────────────
      case "amap_direction_bicycling": {
        const data = await amapGet("/v4/direction/bicycling", {
          origin: args?.origin,
          destination: args?.destination,
        });
        if (!data?.data?.paths?.length) {
          return { content: [{ type: "text", text: `骑行路线规划失败：${data?.info || "无可用路线"}` }] };
        }
        const p = data.data.paths[0];
        return {
          content: [{
            type: "text",
            text: [
              `## 🚲 骑行 | ${args?.origin} → ${args?.destination}`,
              ``,
              `| 项目 | 值 |`,
              `|------|-----|`,
              `| 距离 | ${p.distance ? (Number(p.distance) / 1000).toFixed(1) + " km" : "—"} |`,
              `| 耗时 | ${p.duration ? Math.round(Number(p.duration) / 60) + " 分钟" : "—"} |`,
              ``,
              "**步骤：**",
              "```",
              (p.steps || []).map(s =>
                `  ${s.instruction || ""}  ${s.distance || 0}m`
              ).join("\n"),
              "```",
            ].join("\n"),
          }],
        };
      }

      // ── POI Search ──────────────────────────────────
      case "amap_poi_search": {
        const data = await amapGet("/v3/place/text", {
          keywords: args?.keywords,
          types: args?.types,
          city: args?.city,
          citylimit: args?.citylimit,
          offset: args?.offset || 10,
          page: args?.page || 1,
          extensions: "base",
        });
        const pois = data?.pois || [];
        if (!pois.length) return { content: [{ type: "text", text: `搜索「${args?.keywords}」无结果` }] };
        return {
          content: [{
            type: "text",
            text: [
              `## 🔍 POI搜索: ${args?.keywords}  (共 ${data.count || pois.length} 条)`,
              ``,
              pois.map(formatPOI).join("\n\n"),
            ].join("\n"),
          }],
        };
      }

      // ── POI Around ──────────────────────────────────
      case "amap_poi_around": {
        const data = await amapGet("/v3/place/around", {
          location: args?.location,
          keywords: args?.keywords || "",
          types: args?.types,
          radius: args?.radius || 3000,
          sortrule: args?.sortrule || "distance",
          offset: args?.offset || 10,
          extensions: "base",
        });
        const pois = data?.pois || [];
        if (!pois.length) return { content: [{ type: "text", text: `周边搜索无结果` }] };
        return {
          content: [{
            type: "text",
            text: [
              `## 📍 周边搜索: ${args?.keywords || "(全部)"}  (${args?.radius || 3000}m内)`,
              ``,
              pois.map(formatPOI).join("\n\n"),
            ].join("\n"),
          }],
        };
      }

      // ── POI Ranking ─────────────────────────────────
      case "amap_poi_ranking": {
        const top = Math.min(args?.top || 10, 25);
        const minRating = args?.min_rating ? parseFloat(args.min_rating) : 0;
        const sortMode = args?.sort || "rating";
        const maxPages = 5; // max 125 results (25×5)

        // Fetch POIs — use around search if location given, else text search
        let allPois = [];
        if (args?.location) {
          for (let page = 1; page <= maxPages; page++) {
            const data = await amapGet("/v3/place/around", {
              location: args.location,
              keywords: args.keywords || "",
              types: args.types,
              radius: args.radius || 5000,
              sortrule: "distance",
              offset: 25,
              page,
              extensions: "all",
            });
            const pois = data?.pois || [];
            allPois.push(...pois);
            if (pois.length < 25) break;
          }
        } else {
          for (let page = 1; page <= maxPages; page++) {
            const data = await amapGet("/v3/place/text", {
              keywords: args.keywords,
              types: args.types,
              city: args.city,
              citylimit: "true",
              offset: 25,
              page,
              extensions: "all",
            });
            const pois = data?.pois || [];
            allPois.push(...pois);
            if (pois.length < 25) break;
          }
        }

        if (!allPois.length) {
          return { content: [{ type: "text", text: `搜索「${args?.keywords}」无结果` }] };
        }

        // Parse & filter
        const parsed = allPois
          .map(p => ({
            name: p.name || "—",
            address: p.address || "—",
            rating: parseFloat(p.biz_ext?.rating) || 0,
            cost: parseFloat(p.biz_ext?.cost) || 0,
            type: p.type || "—",
            distance: p.distance ? parseInt(p.distance) : null,
            tel: p.tel || "",
            open_time: p.biz_ext?.open_time || "",
            location: p.location || "",
          }))
          .filter(p => p.rating >= minRating);

        // Sort
        if (sortMode === "rating") {
          parsed.sort((a, b) => b.rating - a.rating);
        } else if (sortMode === "cost_asc") {
          parsed.sort((a, b) => (a.cost || 9999) - (b.cost || 9999));
        } else if (sortMode === "cost_desc") {
          parsed.sort((a, b) => (b.cost || 0) - (a.cost || 0));
        }

        const ranked = parsed.slice(0, top);
        const locInfo = args?.location
          ? `${args.radius || 5000}m内`
          : `${args.city || "全国"}`;

        const lines = [
          `## 🏆 扫街榜: ${args.keywords}  (${locInfo}, 按${sortMode === "rating" ? "评分" : sortMode === "cost_asc" ? "低价" : "高价"}排序)`,
          ``,
          `| # | 店名 | 评分 | 人均 | 距离 | 地址 |`,
          `|---|------|:--:|:--:|:--:|------|`,
        ];

        for (let i = 0; i < ranked.length; i++) {
          const r = ranked[i];
          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`;
          const distStr = r.distance !== null
            ? r.distance >= 1000 ? `${(r.distance / 1000).toFixed(1)}km` : `${r.distance}m`
            : "—";
          const costStr = r.cost ? `¥${r.cost}` : "—";
          lines.push(`| ${medal} | **${r.name}** | ${r.rating.toFixed(1)} | ${costStr} | ${distStr} | ${r.address} |`);
        }

        lines.push("");
        lines.push(`> 共搜索到 ${allPois.length} 条, 筛选评分 ≥ ${minRating}, 展示前 ${ranked.length}`);

        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      // ── Distance ────────────────────────────────────
      case "amap_distance": {
        const data = await amapGet("/v3/distance", {
          origins: args?.origins,
          destination: args?.destination,
          type: args?.type ?? 1,
        });
        const results = data?.results || [];
        return {
          content: [{
            type: "text",
            text: [
              `## 📏 距离测量 → ${args?.destination}`,
              ``,
              ...results.map((r, i) =>
                `  ${i + 1}. ${args?.origins?.split("|")[i] || "?"} → ${r.distance ? (Number(r.distance) / 1000).toFixed(1) + " km" : "—"} | ${r.duration ? Math.round(Number(r.duration) / 60) + " min" : "—"}`
              ),
            ].join("\n"),
          }],
        };
      }

      // ── IP Location ─────────────────────────────────
      case "amap_ip_location": {
        const data = await amapGet("/v3/ip", {});
        return {
          content: [{
            type: "text",
            text: `📍 当前 IP 位置: ${data.province || ""} ${data.city || ""}  (${data.rectangle || ""})`,
          }],
        };
      }

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
});

// ── Start ────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
