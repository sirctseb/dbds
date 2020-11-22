import { pascal } from 'case'
import { factory, InterfaceDeclaration, SyntaxKind, TypeElement } from 'typescript'

import ColumnBuilder from './ColumnBuilder'
import { TableBuilder } from '.'

export default class InsertTypeBuilder extends TableBuilder {
  public get typeName(): string {
    return pascal(this.name)
  }

  protected buildMemberNodes(): TypeElement[] {
    return this.columns.map<TypeElement>((columnInfo) => {
      const builder = new ColumnBuilder(columnInfo, this.types)
      let signature = builder.buildSignature()

      if (columnInfo.hasDefault) {
        signature = factory.updatePropertySignature(
          signature,
          signature.modifiers,
          signature.name,
          factory.createToken(SyntaxKind.QuestionToken),
          signature.type
        )
      }

      return signature
    })
  }

  public buildDeclaration(): InterfaceDeclaration {
    let declaration = super.buildDeclaration()
    declaration = factory.updateInterfaceDeclaration(
      declaration,
      declaration.decorators,
      declaration.modifiers,
      factory.createIdentifier(declaration.name.text + '$Insert'),
      declaration.typeParameters,
      declaration.heritageClauses,
      declaration.members
    )
    return declaration
  }
}
