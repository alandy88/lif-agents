# Email Tier Classification

## Tier 1 -- Respond Today (urgent/actionable)

| Gmail Label | Key Senders |
|-------------|-------------|
| 出租房 | YPMS Rentals |
| 学校/孩子 | Meadowbank School, Saint Kentigern, SwimTastic |
| 健康/医疗 | Auckland Eye, Meadowbank Family Doctors |

Override rules:
- Starred messages -> always Tier 1
- Emails with "urgent", "overdue", "final notice" in subject -> Tier 1

## Tier 2 -- Respond This Week

| Gmail Label | Key Senders |
|-------------|-------------|
| 水电网 | Auckland Council, Frank Energy, Nova Energy, Water.co.nz |
| 银行/金融 | Sharesies |
| 政府/官方 | IRD |
| 收据 | Anthropic, Apple, NLG, Jason Chen |

Override rules:
- New/unknown senders not matching any label -> Tier 2 (needs human triage)

## Tier 3 -- FYI (read when free)

| Gmail Label | Key Senders |
|-------------|-------------|
| 旅行相关 | Air NZ Airpoints |
| 快递/物流 | (various) |

## Tier 4 -- Skip (count only, don't summarize)

| Gmail Label | Key Senders |
|-------------|-------------|
| 新闻通讯 | Morning Brew, Medium, Stack Overflow |
| 房产资讯 | Barfoot & Thompson, Ray White, homes.co.nz |
| 零售促销 | PB Tech, JB Hi-Fi, IKEA, Domino's |
| 社交通知 | Instagram, LinkedIn |
| 订阅/软件 | Google Cloud, Rive, Deku Deals |

## Gmail Label ID Mapping

The API returns `labelIds` (not human names). Use this mapping:

| labelId | Label Name | Tier |
|---------|-----------|------|
| Label_5971376357112502399 | 出租房 | 1 |
| Label_1034924911097103794 | 学校/孩子 | 1 |
| Label_32 | 健康/医疗 | 1 |
| Label_3195131374662628404 | 水电网 | 2 |
| Label_30 | 银行/金融 | 2 |
| Label_31 | 政府/官方 | 2 |
| Label_2 | 收据 | 2 |
| Label_3 | 旅行相关 | 3 |
| Label_34 | 快递/物流 | 3 |
| Label_989729144095743342 | 新闻通讯 | 4 |
| Label_4136687303017620664 | 房产资讯 | 4 |
| Label_5055157283212144800 | 零售促销 | 4 |
| Label_35 | 社交通知 | 4 |
| Label_33 | 订阅/软件 | 4 |

## Classification Logic

To classify an email:

1. Check if starred (`STARRED` in labelIds) -> Tier 1
2. Check `labelIds` against the mapping table above -> assign initial tier
3. If no label match, check sender against known senders in the tier tables -> assign initial tier
4. If still unmatched -> Tier 2 (unknown = needs human eyes)
5. **Override pass:** Check subject for keywords "urgent", "overdue", "final notice" -> bump to Tier 1 regardless of initial tier

## Known Auto-pay Providers (skip in invoice scan)

Skinny Broadband, Watercare, 2degrees, Apple, Canva, Costco NZ
