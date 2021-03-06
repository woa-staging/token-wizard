import React from 'react'
import { FormSpy, Field } from 'react-final-form'
import { FieldArray } from 'react-final-form-arrays'
import { ManageTierBlock } from './ManageTierBlock'
import { ManageDutchAuctionBlock } from './ManageDutchAuctionBlock'
import classNames from 'classnames'
import { InputField } from '../Common/InputField'
import { TEXT_FIELDS } from '../../utils/constants'
import { InputField2 } from '../Common/InputField2'
import {
  composeValidators,
  isDateLaterThan,
  isDecimalPlacesNotGreaterThan,
  isLessOrEqualThan,
  isNonNegative
} from '../../utils/validations'
import { AboutCrowdsale } from './AboutCrowdsale'
import { inject, observer } from 'mobx-react'
import { dateToTimestamp } from '../../utils/utils'

export const ManageForm = inject('tokenStore', 'generalStore', 'crowdsaleStore')(observer(({
  handleSubmit,
  invalid,
  handleChange,
  canSave,
  tokenStore,
  generalStore,
  crowdsaleStore,
  displaySave,
  ...props,
}) => {
  const { tiers } = props.initialValues

  if (!tiers[0]) return null

  const inputErrorStyle = {
    color: 'red',
    fontWeight: 'bold',
    fontSize: '12px',
    width: '100%',
    height: '20px',
  }

  // const button_disabled = (pristine || invalid) && !canSave -- use once canSave TO-DO is done
  const button_disabled = invalid || !canSave

  const crowdsale_has_started = !isDateLaterThan()(dateToTimestamp(tiers[0].startTime))(Date.now())
  const some_tier_whitelisted = tiers.some(tier => tier.whitelistEnabled === 'yes')
  const has_editable_tier = tiers.some(tier => tier.updatable)
  const minimum_supply = tiers.reduce((min, tier) => tier.supply < min ? tier.supply : min, Infinity)

  const saveButton = (
    <button type="submit" className={classNames('no_arrow', 'button', 'button_fill', {
      'button_disabled': button_disabled
    })} style={{border: 'none'}}>
      Save
    </button>
  )

  return (
    <form onSubmit={handleSubmit}>
      <div className="steps">
        <div className='steps-content container'>
          <AboutCrowdsale
            name={tokenStore.name}
            ticker={tokenStore.ticker}
            execID={crowdsaleStore.execID}
            networkID={generalStore.networkID}
          />
          {props.aboutTier}
          <div className="input-block-container">
            <Field
              name="minCap"
              component={InputField2}
              validate={composeValidators(
                isNonNegative(),
                isDecimalPlacesNotGreaterThan()(tokenStore.decimals),
                isLessOrEqualThan(`Should be less than or equal to ${minimum_supply}`)(minimum_supply)
              )}
              disabled={!props.canEditTiers || !has_editable_tier || crowdsale_has_started || some_tier_whitelisted}
              errorStyle={inputErrorStyle}
              type="number"
              side="left"
              label={TEXT_FIELDS.MIN_CAP}
              value={props.initialValues.minCap}
            />

            <InputField
              side='right'
              type='text'
              title={TEXT_FIELDS.WALLET_ADDRESS}
              value={tiers[0].walletAddress}
              disabled={true}
            />
          </div>
        </div>
      </div>
      <FieldArray name="tiers">
        {({ fields }) => crowdsaleStore.isMintedCappedCrowdsale
          ? <ManageTierBlock fields={fields} {...props} />
          : <ManageDutchAuctionBlock fields={fields} {...props} />
        }
      </FieldArray>
      <FormSpy subscription={{ values: true }} onChange={handleChange}/>

      <div className="steps">
        <div className="button-container">
          { displaySave? saveButton : null }
        </div>
      </div>

    </form>
  )
}))
