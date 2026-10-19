import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import { createContext, type ReactElement, type ReactNode, useContext } from 'react';

const page = { backgroundColor: '#f4f4f5', fontFamily: 'Helvetica, Arial, sans-serif' };
const card = {
  backgroundColor: '#ffffff',
  margin: '24px auto',
  padding: '24px',
  maxWidth: '560px',
};
const logo = { maxHeight: '48px', maxWidth: '200px', marginBottom: '16px' };
const footer = { color: '#71717a', fontSize: '12px' };

/** The tenant an email is sent for, with its absolute logo URL (TN-05). */
export interface EmailBrand {
  tenantName: string;
  logoUrl: string;
}

const BrandContext = createContext<EmailBrand | null>(null);

/** Wraps a template's body so its `EmailLayout` shows the tenant's logo. */
export function withBrand(body: ReactElement, brand: EmailBrand | null): ReactElement {
  return brand ? <BrandContext value={brand}>{body}</BrandContext> : body;
}

/** The frame of every email: preview line, white card with the tenant's logo, footer. */
export function EmailLayout(props: {
  lang: string;
  preview: string;
  footer: string;
  children: ReactNode;
}) {
  const brand = useContext(BrandContext);
  return (
    <Html lang={props.lang}>
      <Head />
      <Preview>{props.preview}</Preview>
      <Body style={page}>
        <Container style={card}>
          {brand ? <Img src={brand.logoUrl} alt={brand.tenantName} style={logo} /> : null}
          <Section>{props.children}</Section>
          <Hr />
          <Text style={footer}>{props.footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}
