import {
  createPrinter,
  factory,
  NewLineKind,
  NodeFlags,
  Printer,
  Statement,
  SyntaxKind,
} from 'typescript'
import * as Case from 'case'

import { EnumBuilder, InsertTypeBuilder, TableBuilder } from './builders'
import NodeBuilder from './builders/NodeBuilder'
import TypeObjectBuilder from './builders/TypeObjectBuilder'
import { SchemaInfo, TypeRegistry } from './database'
import { CaseFunction, Transformations } from './types'
import UtilityTypesBuilder from './builders/UtilityTypesBuilder'
import ZodSchemaBuilder from './builders/ZodSchemaBuilder'

export interface GeneratorOptions {
  schema: SchemaInfo
  genEnums?: boolean
  genInsertTypes?: boolean
  genTables?: boolean
  genTypeObjects?: boolean
  genSchemaObjects?: boolean
  transformColumns?: Transformations.Column
  transformEnumMembers?: Transformations.EnumMember
  transformTypeNames?: Transformations.TypeName
}

const noop: CaseFunction = (value: string): string => value

export default class Generator {
  private printer: Printer
  private schema: SchemaInfo
  private types: TypeRegistry

  public readonly generate: {
    enums: boolean
    insertTypes: boolean
    tables: boolean
    typeObjects: boolean
    schemaObjects: boolean
  }

  public readonly transform: Transformations

  constructor({
    schema,
    genEnums = true,
    genInsertTypes = true,
    genTables = true,
    genTypeObjects = true,
    genSchemaObjects = true,
    transformColumns = 'none',
    transformEnumMembers = 'pascal',
    transformTypeNames = 'pascal',
  }: GeneratorOptions) {
    this.printer = createPrinter({
      newLine: NewLineKind.LineFeed,
      removeComments: false,
    })

    this.schema = schema
    this.types = new TypeRegistry()

    this.generate = Object.freeze({
      enums: genEnums,
      insertTypes: genInsertTypes,
      tables: genTables,
      typeObjects: genTypeObjects,
      schemaObjects: genSchemaObjects,
    })

    this.transform = Object.freeze({
      columns: transformColumns === 'none' ? noop : Case[transformColumns],
      enumMembers:
        transformEnumMembers === 'none' ? noop : Case[transformEnumMembers],
      typeNames: Case[transformTypeNames],
    })
  }

  public async destroy(): Promise<void> {
    await this.schema.disconnect()
  }

  public async build(): Promise<string> {
    const statementBuilders: NodeBuilder<Statement>[] = []

    try {
      await this.buildEnums(statementBuilders)
      await this.buildTables(statementBuilders)
    } catch (error) {
      if (error instanceof Error) {
        console.error(error.message)
      }
      throw error
    }

    const statements = statementBuilders.map<Statement>((builder) =>
      builder.buildNode()
    )

    const sourceFile = factory.createSourceFile(
      [...new UtilityTypesBuilder().buildNodes(), ...statements],
      factory.createToken(SyntaxKind.EndOfFileToken),
      NodeFlags.None
    )

    return this.printer.printFile(sourceFile)
  }

  private async buildEnums(builders: NodeBuilder<Statement>[]): Promise<void> {
    const enums = await this.schema.getEnums()

    enums.forEach((enumInfo) => {
      if (this.generate.enums) {
        const builder = new EnumBuilder(enumInfo, this.types, this.transform)
        this.types.add(builder.name, builder.typename().text, 'enum')
        builders.push(builder)
      }
    })
  }

  private async buildTables(builders: NodeBuilder<Statement>[]): Promise<void> {
    const tables = await this.schema.getTables()

    const processedTableNames: string[] = []

    tables.forEach((tableInfo) => {
      if (this.generate.tables) {
        const builder = new TableBuilder(tableInfo, this.types, this.transform)
        this.types.add(builder.name, builder.typename().text, 'table')
        builders.push(builder)
      }

      if (this.generate.insertTypes) {
        const builder = new InsertTypeBuilder(
          tableInfo,
          this.types,
          this.transform
        )
        builders.push(builder)
      }

      if (this.generate.typeObjects) {
        const builder = new TypeObjectBuilder(
          tableInfo,
          this.types,
          this.transform
        )
        builders.push(builder)
      }

      /* since it's generating constants, we need to make SURE that we only
      generate these once per */
      if (
        this.generate.schemaObjects &&
        !processedTableNames.includes(tableInfo.name)
      ) {
        const builder = new ZodSchemaBuilder(
          tableInfo,
          this.types,
          this.transform
        )
        builders.push(builder)
        processedTableNames.push(tableInfo.name)
      }
    })
  }
}
