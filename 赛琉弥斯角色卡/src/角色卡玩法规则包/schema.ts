// 独立 stat_data schema。只做格式与引用校验，不推导战斗、恢复或经济结果。
export const Schema = z
  .object({
    玩法: z
      .object({
        _规则确认: z
          .object({
            N2基础数值: z.literal('待评审测试基准').prefault('待评审测试基准'),
            地缚: z.literal('暂定通过·实验性').prefault('暂定通过·实验性'),
          })
          .prefault({}),
        玩家人物ID: z.string().min(1).nullable().prefault(null),
        时间: z
          .object({
            剧情时间: z.string().min(1).nullable().prefault(null),
            已结束交锋: z.coerce.number().int().nonnegative().prefault(0),
          })
          .prefault({}),
        人物: z
          .record(
            z.string().min(1).describe('稳定人物ID'),
            z.object({
              姓名: z.string().min(1),
              种族: z.string().min(1),
              面板依据: z.string().min(1),
              体型模板: z.string().nullable().prefault(null),
              生命: z
                .object({ 当前: z.coerce.number().nonnegative(), 上限: z.coerce.number().positive() })
                .refine(data => data.当前 <= data.上限, '生命不能超过上限'),
              有效防御: z.coerce.number().nonnegative(),
              无资源攻击: z.coerce.number().nonnegative(),
              路线: z.record(
                z.string().min(1).describe('已有能量路线，如斗气或法力'),
                z
                  .object({
                    境界: z.coerce.number().int().min(1).max(8),
                    品质: z.coerce.number().positive(),
                    当前能量: z.coerce.number().nonnegative(),
                    能量上限: z.coerce.number().positive(),
                    单次投入上限: z.coerce.number().nonnegative(),
                    修炼进度: z.coerce.number().nonnegative().prefault(0),
                  })
                  .refine(data => data.当前能量 <= data.能量上限, '能量不能超过上限')
                  .refine(data => data.单次投入上限 === data.能量上限 / 5, 'C 必须为最大能量的 20%'),
              ),
              已掌握技能: z.record(z.string().min(1).describe('技能版本ID'), z.literal(true)).prefault({}),
              下次药剂可生效时间: z.string().min(1).nullable().prefault(null),
              天赋: z
                .object({
                  等级: z.enum(['平常', '良好', '优秀', '卓越', '天才', '绝世']),
                  初始境界: z.number().int().min(1).max(8),
                  规则版本: z.literal(1),
                })
                .optional(),
              _成长: z
                .object({
                  结算至: z.string().nullable(),
                  基础面板: z.object({
                    生命上限: z.number().positive(),
                    防御: z.number().nonnegative(),
                    攻击: z.number().nonnegative(),
                    路线能量: z.record(z.string(), z.number().positive()),
                  }),
                  吸收: z.record(
                    z.string(),
                    z.object({ 日期: z.string(), 上限: z.number().nonnegative(), 已用: z.number().nonnegative() }),
                  ),
                  晋升待报: z.record(
                    z.string(),
                    z.object({ 原境界: z.number().int().min(1).max(8), 新境界: z.number().int().min(1).max(8) }),
                  ),
                })
                .optional(),
              装备: z
                .partialRecord(
                  z.enum(['weapon', 'armor', 'accessory1', 'accessory2', 'growth', 'special']),
                  z.object({ 库存ID: z.string().min(1), 物品ID: z.string().min(1) }),
                )
                .optional(),
            }),
          )
          .prefault({}),
        技能定义: z
          .record(
            z.string().min(1).describe('固定技能版本ID，版本升级使用新ID'),
            z.object({
              名称: z.string().min(1),
              确认状态: z.enum(['已通过', '待评审', '暂定通过·实验性']),
              路线: z.string().min(1),
              门槛: z.string().min(1),
              固定消耗: z.coerce.number().nonnegative(),
              固定规格: z.string().min(1),
            }),
          )
          .prefault({}),
        护盾: z
          .record(
            z.string().min(1).describe('人物ID，每人最多一盾'),
            z.object({
              技能版本ID: z.string().min(1),
              剩余盾值: z.coerce.number().positive(),
              结束交锋: z.coerce.number().int().nonnegative(),
            }),
          )
          .prefault({}),
        准备: z
          .record(
            z.string().min(1).describe('人物ID，每人一项准备'),
            z.object({
              技能版本ID: z.string().min(1),
              剩余准备行动: z.coerce.number().int().nonnegative(),
            }),
          )
          .prefault({}),
        实验性地缚: z
          .record(
            z.string().min(1).describe('被束缚人物ID，每人一条有效束缚'),
            z.object({
              技能版本ID: z.string().min(1),
              有效强度: z.coerce.number().positive(),
              结束交锋: z.coerce.number().int().nonnegative(),
            }),
          )
          .prefault({}),
        休整: z
          .record(
            z.string().min(1).describe('正在连续休整的人物ID'),
            z.object({ 开始时间: z.string().min(1), 条件: z.string().min(1) }),
          )
          .prefault({}),
        当日修炼: z
          .record(
            z.string().min(1).describe('当天实际训练的人物ID，全部路线共用每日上限'),
            z.object({ 日期: z.string().min(1), 已得进度: z.coerce.number().min(0).max(4) }),
          )
          .prefault({}),
        库存: z
          .record(
            z.string().min(1).describe('稳定库存ID，同一批资产只登记一次'),
            z.object({
              所属: z.string().min(1),
              资金: z.coerce.number().nonnegative(),
              补给: z.coerce.number().nonnegative(),
              材料: z.coerce.number().nonnegative(),
              物品: z
                .record(
                  z.string().min(1).describe('物品ID，同规格批次合并数量'),
                  z.object({
                    名称: z.string().min(1),
                    数量: z.coerce.number().int().nonnegative(),
                    固定规格: z.string().min(1),
                    宝物: z
                      .object({
                        大类: z.enum(['武器', '防具', '饰品', '修为秘宝', '特殊物品']),
                        子类: z.enum(['普通', '法杖']),
                        适用路线: z.enum(['通用', '斗气', '法力']),
                        使用方式: z.enum(['佩戴', '消耗', '特殊']),
                        归属人物ID: z.string().min(1).nullable(),
                        品阶: z.number().int().min(1).max(8).optional(),
                        效果: z
                          .array(
                            z.object({
                              类型: z.enum(['固定属性', '比例属性', '成长加速', '修为']),
                              属性: z.enum(['生命', '能量', '攻击', '防御']).optional(),
                              路线: z.string().min(1).optional(),
                              份额: z.union([z.literal(0.5), z.literal(1)]),
                            }),
                          )
                          .min(1)
                          .max(2)
                          .optional(),
                        固定加成: z
                          .object({ 攻击: z.number().nonnegative(), 防御: z.number().nonnegative() })
                          .optional(),
                      })
                      .refine(
                        item => item.子类 !== '法杖' || (item.大类 === '武器' && item.适用路线 === '法力'),
                        '法杖必须登记为法力路线武器',
                      )
                      .refine(
                        item =>
                          !item.效果 ||
                          (item.品阶 !== undefined &&
                            !item.固定加成 &&
                            item.大类 !== '特殊物品' &&
                            item.效果.reduce((sum, effect) => sum + effect.份额, 0) <= 1 &&
                            item.效果.every(effect => {
                              const attribute = effect.类型 === '固定属性' || effect.类型 === '比例属性';
                              if (attribute !== Boolean(effect.属性)) return false;
                              if ((effect.属性 === '能量' || !attribute) !== Boolean(effect.路线)) return false;
                              if (item.适用路线 !== '通用' && effect.路线 && effect.路线 !== item.适用路线)
                                return false;
                              return effect.类型 === '修为'
                                ? item.使用方式 === '消耗' && item.大类 === '修为秘宝'
                                : item.使用方式 === '佩戴';
                            })),
                        '效果必须符合品阶、用途与一份总预算；特殊效果尚未开放',
                      )
                      .optional(),
                  }),
                )
                .prefault({}),
            }),
          )
          .prefault({}),
        军队: z
          .record(
            z.string().min(1).describe('稳定军队ID'),
            z.object({
              名称: z.string().min(1),
              库存ID: z.string().min(1),
              命令: z.string(),
              构成: z.record(
                z.string().min(1).describe('职业与境界分组ID'),
                z
                  .object({
                    职业: z.string().min(1),
                    境界: z.string().min(1),
                    存活人数: z.coerce.number().int().nonnegative(),
                    其中伤员: z.coerce.number().int().nonnegative(),
                    累计死亡: z.coerce.number().int().nonnegative().prefault(0),
                  })
                  .refine(data => data.其中伤员 <= data.存活人数, '伤员属于存活人数'),
              ),
              关键人物: z
                .record(z.string().min(1).describe('人物ID，仅引用而不额外计数'), z.literal(true))
                .prefault({}),
            }),
          )
          .prefault({}),
        领地: z
          .record(
            z.string().min(1).describe('稳定领地ID'),
            z.object({
              名称: z.string().min(1),
              等级: z.coerce.number().int().min(1).max(5),
              库存ID: z.string().min(1),
              产出结算至: z.string().min(1),
            }),
          )
          .prefault({}),
        合同: z
          .record(
            z.string().min(1).describe('费用合同ID，覆盖对象和费用不得重复'),
            z.object({
              库存ID: z.string().min(1),
              覆盖对象与费用: z.string().min(1),
              资金日率: z.coerce.number().nonnegative(),
              补给日率: z.coerce.number().nonnegative(),
              结算至: z.string().min(1),
            }),
          )
          .prefault({}),
        项目: z
          .record(
            z.string().min(1).describe('实际进行的学习、培养、招募或建设项目ID'),
            z.object({
              类型: z.enum(['启蒙', '学习', '元素学习', '晋阶', '招募', '建设']),
              人物ID: z.string().min(1).nullable().prefault(null),
              军队ID: z.string().min(1).nullable().prefault(null),
              领地ID: z.string().min(1).nullable().prefault(null),
              库存ID: z.string().min(1),
              固定规格: z.string().min(1),
              已支付启动费用: z.boolean(),
              开始时间: z.string().min(1),
              进度单位: z.string().min(1),
              已完成进度: z.coerce.number().nonnegative(),
              所需进度: z.coerce.number().positive(),
              进度结算至: z.string().min(1),
            }),
          )
          .prefault({}),
      })
      .prefault({})
      .refine(data => {
        const owns = (items: object, id: string) => Object.hasOwn(items, id);
        const occupied = new Set<string>();
        const slotCategories: Record<string, string> = {
          weapon: '武器',
          armor: '防具',
          accessory1: '饰品',
          accessory2: '饰品',
          growth: '修为秘宝',
          special: '特殊物品',
        };
        for (const [personId, person] of Object.entries(data.人物)) {
          for (const [slot, ref] of Object.entries(person.装备 ?? {})) {
            const item = data.库存[ref.库存ID]?.物品[ref.物品ID];
            const key = JSON.stringify([ref.库存ID, ref.物品ID]);
            if (
              !item?.宝物 ||
              item.数量 !== 1 ||
              item.宝物.使用方式 !== '佩戴' ||
              item.宝物.大类 !== slotCategories[slot] ||
              item.宝物.归属人物ID !== personId ||
              occupied.has(key)
            )
              return false;
            occupied.add(key);
          }
        }
        for (const stock of Object.values(data.库存)) {
          for (const item of Object.values(stock.物品)) {
            if (item.宝物?.归属人物ID != null && !owns(data.人物, item.宝物.归属人物ID)) return false;
          }
        }
        if (data.玩家人物ID !== null && !owns(data.人物, data.玩家人物ID)) return false;
        for (const person of Object.values(data.人物)) {
          for (const id of Object.keys(person.已掌握技能)) {
            if (!owns(data.技能定义, id) || !owns(person.路线, data.技能定义[id].路线)) return false;
          }
        }
        for (const states of [data.护盾, data.准备, data.实验性地缚]) {
          for (const [id, state] of Object.entries(states)) {
            if (!owns(data.人物, id) || !owns(data.技能定义, state.技能版本ID)) return false;
          }
        }
        for (const states of [data.休整, data.当日修炼]) {
          if (Object.keys(states).some(id => !owns(data.人物, id))) return false;
        }
        for (const group of Object.values(data.军队)) {
          if (!owns(data.库存, group.库存ID) || Object.keys(group.关键人物).some(id => !owns(data.人物, id)))
            return false;
        }
        for (const entry of [...Object.values(data.领地), ...Object.values(data.合同), ...Object.values(data.项目)]) {
          if (!owns(data.库存, entry.库存ID)) return false;
        }
        for (const entry of Object.values(data.项目)) {
          if (entry.人物ID !== null && !owns(data.人物, entry.人物ID)) return false;
          if (entry.军队ID !== null && !owns(data.军队, entry.军队ID)) return false;
          if (entry.领地ID !== null && !owns(data.领地, entry.领地ID)) return false;
        }
        return true;
      }, '人物、技能、路线或库存引用不存在；同一轮增删关联记录时须一并更新'),
  })
  .catchall(z.unknown());
