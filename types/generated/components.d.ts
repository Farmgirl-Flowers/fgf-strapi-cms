import type { Schema, Attribute } from '@strapi/strapi';

export interface ComponentsButton extends Schema.Component {
  collectionName: 'components_components_buttons';
  info: {
    displayName: 'Button';
    icon: 'cursor';
    description: '';
  };
  attributes: {
    label: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    url: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    type: Attribute.Enumeration<['primary', 'secondary']> &
      Attribute.Required &
      Attribute.DefaultTo<'secondary'>;
  };
}

export interface ComponentsContentBlock extends Schema.Component {
  collectionName: 'components_components_content_blocks';
  info: {
    displayName: 'Content Block';
    icon: 'feather';
    description: '';
  };
  attributes: {
    body: Attribute.RichText &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        minLength: 2;
      }>;
    textAlignment: Attribute.Enumeration<['left', 'center', 'right']> &
      Attribute.Required &
      Attribute.DefaultTo<'left'>;
  };
}

export interface ComponentsHeroHeader extends Schema.Component {
  collectionName: 'components_components_hero_headers';
  info: {
    displayName: 'Hero Header';
    icon: 'landscape';
    description: '';
  };
  attributes: {
    backgroundImage: Attribute.Media<'images'> & Attribute.Required;
    title: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        minLength: 1;
        maxLength: 180;
      }>;
    tagline: Attribute.RichText;
    button: Attribute.Component<'components.button'>;
  };
}

export interface ComponentsListPressMentions extends Schema.Component {
  collectionName: 'components_components_list_press_mentions';
  info: {
    displayName: 'List Press Mentions';
    icon: 'apps';
  };
  attributes: {
    press_mentions: Attribute.Relation<
      'components.list-press-mentions',
      'oneToMany',
      'api::press-mention.press-mention'
    >;
  };
}

export interface SharedMedia extends Schema.Component {
  collectionName: 'components_shared_media';
  info: {
    displayName: 'Media';
    icon: 'file-video';
  };
  attributes: {
    file: Attribute.Media<'images' | 'files' | 'videos'>;
  };
}

export interface SharedQuote extends Schema.Component {
  collectionName: 'components_shared_quotes';
  info: {
    displayName: 'Quote';
    icon: 'indent';
  };
  attributes: {
    title: Attribute.String;
    body: Attribute.Text;
  };
}

export interface SharedRichText extends Schema.Component {
  collectionName: 'components_shared_rich_texts';
  info: {
    displayName: 'Rich text';
    icon: 'align-justify';
    description: '';
  };
  attributes: {
    body: Attribute.RichText;
  };
}

export interface SharedSeo extends Schema.Component {
  collectionName: 'components_shared_seos';
  info: {
    name: 'Seo';
    icon: 'allergies';
    displayName: 'Seo';
    description: '';
  };
  attributes: {
    metaTitle: Attribute.String & Attribute.Required;
    metaDescription: Attribute.Text & Attribute.Required;
    shareImage: Attribute.Media<'images'>;
  };
}

export interface SharedSlider extends Schema.Component {
  collectionName: 'components_shared_sliders';
  info: {
    displayName: 'Slider';
    icon: 'address-book';
    description: '';
  };
  attributes: {
    files: Attribute.Media<'images', true>;
  };
}

declare module '@strapi/types' {
  export module Shared {
    export interface Components {
      'components.button': ComponentsButton;
      'components.content-block': ComponentsContentBlock;
      'components.hero-header': ComponentsHeroHeader;
      'components.list-press-mentions': ComponentsListPressMentions;
      'shared.media': SharedMedia;
      'shared.quote': SharedQuote;
      'shared.rich-text': SharedRichText;
      'shared.seo': SharedSeo;
      'shared.slider': SharedSlider;
    }
  }
}
