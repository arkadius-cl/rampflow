import { Body, Container, Head, Hr, Html, Preview, Section, Text } from '@react-email/components';
import type { ReactNode } from 'react';

const page = { backgroundColor: '#f4f4f5', fontFamily: 'Helvetica, Arial, sans-serif' };
const card = {
  backgroundColor: '#ffffff',
  margin: '24px auto',
  padding: '24px',
  maxWidth: '560px',
};
const footer = { color: '#71717a', fontSize: '12px' };

/** The frame of every email: preview line, white card, footer. Templates fill the card. */
export function EmailLayout(props: {
  lang: string;
  preview: string;
  footer: string;
  children: ReactNode;
}) {
  return (
    <Html lang={props.lang}>
      <Head />
      <Preview>{props.preview}</Preview>
      <Body style={page}>
        <Container style={card}>
          <Section>{props.children}</Section>
          <Hr />
          <Text style={footer}>{props.footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}
