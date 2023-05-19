import type { TSESTree } from '@typescript-eslint/types'

import { AST_NODE_TYPES } from '@typescript-eslint/types'

import { createEslintRule } from '~/utils/create-eslint-rule'
import { rangeToDiff } from '~/utils/range-to-diff'
import { SortType, SortOrder } from '~/typings'
import { sortNodes } from '~/utils/sort-nodes'
import type { SortingNode } from '~/typings'
import { complete } from '~/utils/complete'
import { compare } from '~/utils/compare'

type MESSAGE_ID = 'unexpectedArrayIncludesOrder'

type Options = [
  Partial<{
    order: SortOrder
    type: SortType
    spreadLast: boolean
  }>,
]

export const RULE_NAME = 'sort-array-includes'

export default createEslintRule<Options, MESSAGE_ID>({
  name: RULE_NAME,
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce sorted arrays before include method',
      recommended: false,
    },
    messages: {
      unexpectedArrayIncludesOrder: 'Expected "{{second}}" to come before "{{first}}"',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          type: {
            enum: [SortType.natural, SortType['line-length']],
            default: SortType.natural,
          },
          order: {
            enum: [SortOrder.asc, SortOrder.desc],
            default: SortOrder.asc,
          },
          spreadLast: {
            type: 'boolean',
            default: false,
          },
        },
        additionalProperties: false,
      },
    ],
  },
  defaultOptions: [
    {
      type: SortType.natural,
      order: SortOrder.asc,
    },
  ],
  create: context => ({
    MemberExpression: node => {
      if (
        (node.object.type === AST_NODE_TYPES.ArrayExpression || node.object.type === AST_NODE_TYPES.NewExpression) &&
        node.property.type === AST_NODE_TYPES.Identifier &&
        node.property.name === 'includes'
      ) {
        let options = complete(context.options.at(0), {
          type: SortType.natural,
          order: SortOrder.asc,
          spreadLast: false,
        })

        let elements =
          node.object.type === AST_NODE_TYPES.ArrayExpression ? node.object.elements : node.object.arguments

        if (elements.length > 1) {
          let source = context.getSourceCode().text

          let values: (SortingNode & { type: string })[] = elements
            .reduce(
              (
                accumulator: (SortingNode & { type: string })[][],
                element: TSESTree.Expression | TSESTree.SpreadElement | null,
              ) => {
                if (element === null) {
                  return accumulator
                }

                accumulator.at(0)!.push({
                  name: element.type === AST_NODE_TYPES.Literal ? element.raw : source.slice(...element.range),
                  size: rangeToDiff(element.range),
                  type: element.type,
                  node: element,
                })

                return accumulator
              },
              [[], []],
            )
            .flat()

          for (let i = 1; i < values.length; i++) {
            let firstIndex = i - 1
            let secondIndex = i
            let first = values.at(firstIndex)!
            let second = values.at(secondIndex)!

            let compareValue: boolean

            if (
              options.spreadLast &&
              first.node.type === AST_NODE_TYPES.Literal &&
              second.node.type === AST_NODE_TYPES.SpreadElement
            ) {
              compareValue = false
            } else if (
              options.spreadLast &&
              first.node.type === AST_NODE_TYPES.SpreadElement &&
              second.node.type === AST_NODE_TYPES.Literal
            ) {
              compareValue = true
            } else {
              compareValue = compare(first, second, options)
            }

            if (compareValue) {
              context.report({
                messageId: 'unexpectedArrayIncludesOrder',
                data: {
                  first: first.name,
                  second: second.name,
                },
                node: second.node,
                fix: fixer => {
                  let sourceCode = context.getSourceCode()
                  let { text } = sourceCode

                  return sortNodes(fixer, text, values, options)
                },
              })
            }
          }
        }
      }
    },
  }),
})
